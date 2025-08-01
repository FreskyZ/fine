import fs from 'node:fs/promises';
import net from 'node:net';
import type { ForwardContext } from '../adk/api-server.js';
import type { AdminInterfaceCommand, AdminInterfaceResponse } from '../shared/admin.js';
import { MyError } from './error.js';
import { log } from './logger.js';
import type { MyContext, WebappConfig } from './access.js';
import { webapps } from './access.js';

// forward api invocations to services, with pooled connections

interface PoolItem {
    connection: net.Socket,
    state: 'uninit' | 'available' | 'acquired',
}
interface Pool {
    // initialized as POOLSIZE as uninit
    items: ReadonlyArray<PoolItem>,
    // wait queue for available item, FIFO
    waits: ((connection: net.Socket) => any)[],
}

// item count for each pool (each socket path)
const POOL_SIZE = 12;
// wait queue size limit, in that case
// request is too long and should timeout 500 (as some resource not available)
const WAIT_SIZE = 12;
// 10 minute timeout for idle disconnect
const IDLE_TIMEOUT = 600_000;
// 1 minute timeout for normal request
const REQUEST_TIMEOUT = 60_000;

// property key is app name (ctx.state.app)
let socketPools: Record<string, Pool>;
export function setupForwarding(config: WebappConfig) {
    socketPools = Object.fromEntries<Pool>(Object.entries(config).filter(a => a[1].server.startsWith('socket:')).map(a => [a[0], {
        waits: [] as Pool['waits'],
        // need to fill air into the array or else the items are vaccum, then the map call maps nothing
        items: new Array<void>(POOL_SIZE).fill().map<PoolItem>(() => ({ state: 'uninit', connection: null })),
    }]));
}

async function acquire(socketPath: string, pool: Pool, requestDisplay: string): Promise<net.Socket> {

    for (const item of pool.items) {
        if (item.state == 'uninit') {
            // immediatetely set state, this should be atomic enough
            item.state = 'acquired';
            await initializePoolItem(socketPath, item);
            return item.connection;
        } else if (item.state == 'available') {
            item.state = 'acquired';
            return item.connection;
        }
    }

    // too much
    if (pool.waits.length > WAIT_SIZE) {
        throw new MyError('internal', 'pool wait overflow');
    }
    // // this is unexpectedly simple
    return new Promise(resolve => pool.waits.push(resolve));

    function cleanupItem(item: PoolItem) {
        // remove may be not used once('data') event handler
        if (item.connection) {
            item.connection.removeAllListeners('data');
        }
        item.connection = null;
        // set state after set connection, in case it is acquired between the 2 statements
        item.state = 'uninit';
    }
    async function initializePoolItem(socketPath: string, item: PoolItem) {
        return new Promise<void>((resolve, reject) => {
            item.connection = new net.Socket();
            item.connection.once('connect', () => {
                resolve();
                item.connection.on('error', error => {
                    log.error(`${requestDisplay}: ` + error.message);
                    cleanupItem(item);
                });
            });
    
            // this once error is initial connection error
            // normally caused by service not start: ENOENT (file not exist)
            item.connection.once('error', error => {
                log.error(`${requestDisplay}: ` + error.message);
                cleanupItem(item);
                reject(new MyError('service-not-available'));
            });
    
            item.connection.setTimeout(IDLE_TIMEOUT);
            item.connection.on('timeout', () => {
                item.connection.destroy();
                cleanupItem(item);
            });
    
            // will this happen when previous 2 events handled?
            item.connection.on('close', () => {
                cleanupItem(item);
            });
            item.connection.connect(socketPath);
        })
    }
}
function release(pool: Pool, connection: net.Socket) {
    if (pool.waits.length) {
        // // this is unexpectedly simply, too
        queueMicrotask(() => pool.waits.shift()(connection));
        return;
    }
    const item = pool.items.find(i => i.connection === connection);
    item.state = 'available';
}

async function invokeSocket(ctx: MyContext, app: typeof webapps[0], requestPathAndQuery: string, requestDisplay: string) {

    // pools and allowedOrigins initialized from same data source so must exist
    const pool = socketPools[ctx.state.app];
    const connection = await acquire(app.server.substring(7), pool, requestDisplay);

    return new Promise<void>((resolve, reject) => {
        // timeout 1 min for normal request
        const timeout = setTimeout(() => {
            log.error(`${requestDisplay} timeout`);
            reject(new MyError('gateway-timeout', 'service timeout'));
            connection.removeAllListeners('data');
            release(pool, connection);
        }, REQUEST_TIMEOUT);

        connection.once('data', data => {
            clearTimeout(timeout);
            const dataString = data.toString();
            let response: ForwardContext;
            try {
                response = JSON.parse(data.toString());
            } catch (error) {
                log.error(`failed to parse response: ${error}: ${dataString}`);
                reject(new MyError('bad-gateway', 'failed to parse response'));
                return;
            }
            if (response.error) {
                reject(response.error);
                return;
            }
            ctx.status = response.status || 200;
            if (response.body) { ctx.body = response.body; }
            resolve();
            release(pool, connection);
        });

        connection.write(JSON.stringify({ method: ctx.method, path: requestPathAndQuery, body: ctx.request.body, state: ctx.state }));
    });
}
async function invokeScript(ctx: MyContext, app: typeof webapps[0], requestPathAndQuery: string, requestDisplay: string) {

    let module: any;
    try {
        module = await import(`${app.server.substring(7)}?version=${app.version}`);
    } catch (error) {
        log.error({ message: 'failed to load module', request: requestDisplay, server: app.server, version: app.version, error: error });
        throw new MyError('service-not-available'); // cannot connect to service is 503
    }

    if (!module.dispatch || typeof module.dispatch != 'function') {
        // 502 bad gateway is invalid response,
        // so this invalid shape is considered as 'correct service not available'
        throw new MyError('service-not-available', 'invalid server');
    }

    // TODO can this follow JSONRPC? https://www.jsonrpc.org/specification
    let response: ForwardContext;
    try {
        response = await module.dispatch({ method: ctx.method, path: requestPathAndQuery, body: ctx.request.body, state: ctx.state });
    } catch (error) {
        log.error({ message: 'error ' + error.toString(), request: requestDisplay, error: error });
        if (error.name != 'FineError') {
            throw new MyError('bad-gateway', 'error raised');
        } else {
            // seems no rethrow in javascript
            throw error;
        }
    }
    // this reject 0 or false, but should be ok
    if (!response || typeof response != 'object') {
        log.error({ message: 'no response', request: requestDisplay });
        throw new MyError('bad-gateway', 'no response');
    } else if (response.error) {
        log.error({ message: 'error returned', request: requestDisplay, error: response.error });
        throw response.error;
    }

    ctx.status = response.status || 200;
    if (response.body) { ctx.body = response.body; }
}

export async function handleRequestForward(ctx: MyContext): Promise<void> {
    // handleRequestCrossDomain already checked origin is allowed and assigned known state.app
    if (!ctx.state.app || !webapps.some(a => a.name == ctx.state.app)) { throw new MyError('unreachable'); }

    const pathAndQuery = ctx.url.substring(ctx.state.app.length + 1);
    const requestDisplay = `request ${ctx.method} ${ctx.host}${ctx.url} (${JSON.stringify(ctx.state)})`;

    const app = webapps.find(a => a.name == ctx.state.app);
    await (app.server.startsWith('nodejs:') ? invokeScript : invokeSocket)(ctx, app, pathAndQuery, requestDisplay);
}

// do not reload server when file content is same
// this was implemented in watch build in old build script, but that's kind of complex for now()
// key is app name, the entries are lazy, it is loaded after first time reload command is executed
const serverFileContents: Record<string, Buffer> = {};
export async function handleForwardCommand(command: AdminInterfaceCommand): Promise<AdminInterfaceResponse> {
    
    if (command.kind == 'app:reload-server') {
        const app = webapps.find(a => a.name == command.name);
        if (app) {
            const newFileContent = await fs.readFile(app.server.substring(7));
            if (app.name in serverFileContents && Buffer.compare(serverFileContents[app.name], newFileContent) == 0) {
                return { ok: true, log: 'no update because content same' };
            } else {
                app.version += 1;
                serverFileContents[app.name] = newFileContent;
                return { ok: true, log: 'update version', app };
            }
        } else {
            return { ok: false, log: 'name not found' };
        }
    }
    return null;
}
