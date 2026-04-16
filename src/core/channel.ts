import fs from 'node:fs/promises';
import net from 'node:net';
import type { AdminInterfaceCommand, AdminInterfaceResult } from '../shared/admin-types.js';
import type { ApplicationServerRequest, ApplicationServerResponse } from '../shared/server-helper-hmr.js';
import { MyError } from '../shared/error.js';
import { log } from './logger.js';
import type { MyContext } from './access.js';

// channel between core module and application servers

interface ModuleHandlers {
    readonly name: string, // application name
    readonly path: string, // nodejs module path
    version: number,
    // these handlers may be null if load or reload process meet error,
    // but when they are not null, they are always function (typeof == 'function')
    handleRequest?: (request: ApplicationServerRequest) => Promise<ApplicationServerRequest>,
    handleCleanup?: () => Promise<void>,
}
async function handleReloadModule(handlers: ModuleHandlers, result: AdminInterfaceResult) {
    result.status = 'ok'; // default to ok, later may change to error

    if (typeof handlers.handleCleanup == 'function') {
        try {
            await handlers.handleCleanup();
        } catch (error) {
            result.status = 'error';
            result.logs.push(`${handlers.path}: failed to cleanup previous version`, error);
            // not return here
        }
    }
    handlers.handleRequest = null;
    handlers.handleCleanup = null;

    let module: any;
    handlers.version += 1;
    result.logs.push(`${handlers.path}: new version ${handlers.version}`);
    try {
        module = await import(`${handlers.path}?v=${handlers.version}`);
    } catch (error) {
        module = null;
        result.status = 'error';
        result.logs.push(`${handlers.path}: failed to load module ${handlers.path}`, error);
    }

    if (typeof module?.dispatch == 'function') {
        handlers.handleRequest = module.dispatch;
    } else if (module) {
        result.status = 'error';
        result.logs.push(`${handlers.path}: missing dispatch or is not a function`);
    }
    if (typeof module?.cleanup == 'function') {
        handlers.handleCleanup = module.cleanup;
    } else if (module?.handleCleanup) {
        result.status = 'error';
        result.logs.push(`${handlers.path}: cleanup is exported but is not a function?`);
    }

    // duplicate admin command result logs into logger
    for (const item of result.logs) {
        log.info({ cat: 'external content', handlers, item });
    }
}

const moduleHandlers: ModuleHandlers[] = [];
async function handleRequestModule(ctx: MyContext, path: string, request: ApplicationServerRequest) {

    let module = moduleHandlers.find(m => m.path == path);
    if (!module) {
        module = { name: ctx.state.appconfig.name, path, version: 0 };
        const result: AdminInterfaceResult = { status: 'unhandled', logs: [] };
        moduleHandlers.push(module);
        await handleReloadModule(module, result);
    }
    if (!module.handleRequest) {
        // cannot connect to service is 503
        throw new MyError('service-not-available');
    }

    let response: ApplicationServerResponse;
    try {
        response = await module.handleRequest(request);
    } catch (error) {
        log.error({ cat: 'channel', kind: 'dispatch error',
            name: error?.name, message: error?.message, stack: error?.stack, additionalInfo: error?.additionalInfo });
        if (error.name != 'MyError') {
            // invalid response is 502
            throw new MyError('bad-gateway');
        } else {
            throw error; // seems no rethrow in javascript?
        }
    }
    // this reject 0 or false, but should be ok
    if (!response || typeof response != 'object') {
        log.error({ cat: 'channel', kind: 'no response', response });
        throw new MyError('bad-gateway');
    } else if (response.error) {
        log.error({ cat: 'channel', kind: 'resposne error', response });
        throw response.error;
    }

    if (response.body) { ctx.body = response.body; }
}

// to make a resource pool with basic create, destroy and acquire function is easy,
// like pool = createpool({ create, destroy }), then pool.acquire(async connection => { ..., use, and release when return })
// to add timeout and error handling to all the steps is complex
// man 7 unix https://man7.org/linux/man-pages/man7/unix.7.html
// - path name max length 108? 107 actually, why is this so short?
// - socket not exist, this can be checked in advance
// - not a socket file?
// - socket permission error?, this should be handled when connecting
// - connection refused, file exist but no one is listening
// - no connect timeout
//   unix domain socket normally won't connect timeout,
//   I mean you need very special server side operation to make a connect timeout,
//   both side nodejs with default setting or other normal common library in popular languages will not happen
// - socket closed at any time, because of process end or crash, like after acquired before using? and when data is tranfering
//   end means other side is end, close means fully closed
// - data fragmentation, at both side
//   add a length prefix should be enough for now, but... I can copy
//   existing information on binary data structure allowing fragement at any byte position
// - no reconnect, just return error

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
const socketPools: Record<string, Pool> = {};

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
        });
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

async function handleRequestSocket(ctx: MyContext, path: string, request: ApplicationServerRequest) {

    let pool = socketPools[ctx.state.appconfig.name];
    if (!pool) {
        socketPools[ctx.state.appconfig.name] = pool = {
            waits: [],
            // need to fill air into the array or else the items are vaccum, then the map call maps nothing
            items: new Array<void>(POOL_SIZE).fill().map<PoolItem>(() => ({ state: 'uninit', connection: null })),
        };
    }

    const requestDisplay = `request ${ctx.method} ${ctx.host}${ctx.url} (${JSON.stringify(ctx.state)})`;
    const connection = await acquire(path, pool, requestDisplay);

    return new Promise<void>((resolve, reject) => {
        // timeout 1 min for normal request
        const timeout = setTimeout(() => {
            log.error(`${requestDisplay} timeout`);
            reject(new MyError('gateway-timeout'));
            connection.removeAllListeners('data');
            release(pool, connection);
        }, REQUEST_TIMEOUT);

        connection.once('data', data => {
            clearTimeout(timeout);
            const dataString = data.toString();
            let response: ApplicationServerResponse;
            try {
                response = JSON.parse(data.toString());
            } catch (error) {
                log.error(`failed to parse response: ${error}: ${dataString}`);
                reject(new MyError('bad-gateway'));
                return;
            }
            if (response.error) {
                reject(response.error);
                return;
            }
            // ctx.status = response.status || 200;
            if (response.body) { ctx.body = response.body; }
            resolve();
            release(pool, connection);
        });
        connection.write(JSON.stringify(request));
    });
}

export async function handleRequestApplicationServer(ctx: MyContext): Promise<void> {

    const request = {
        time: ctx.state.time.toISOString(),
        userId: ctx.state.userId,
        method: ctx.method,
        // skip the /{appname} prefix, not /{appname}/, or else the result will not start with /
        path: ctx.URL.pathname.substring(ctx.state.appconfig.name.length + 1),
        query: ctx.URL.search,
        body: ctx.request.body,
    } as ApplicationServerRequest;

    if (ctx.state.appconfig.module) {
        await handleRequestModule(ctx, ctx.state.appconfig.module, request);
    } else if (ctx.state.appconfig.socket) {
        await handleRequestSocket(ctx, ctx.state.appconfig.socket, request);
    }
}

// do not reload server when file content is same
// this was implemented in watch build in old build script, but that's kind of complex for now()
// key is app name, the entries are lazy, it is loaded after first time reload command is executed
const serverFileContents: Record<string, Buffer> = {};
export async function handleChannelCommand(command: AdminInterfaceCommand, result: AdminInterfaceResult): Promise<void> {
    // TODO rename command
    if (command.kind == 'actions-server:reload') {
        const module = moduleHandlers.find(a => a.name == command.name);
        if (module) {
            const newFileContent = await fs.readFile(module.path);
            if (module.name in serverFileContents && Buffer.compare(serverFileContents[module.name], newFileContent) == 0) {
                result.status = 'ok';
                result.logs.push('nodiff');
            } else {
                await handleReloadModule(module, result);
                if (result.status == 'ok') {
                    serverFileContents[module.name] = newFileContent;
                } else {
                    // if not ok, the handlers are already cleared, still need to try load again, so clear cache
                    delete serverFileContents[module.name];
                }
            }
        } else {
            result.status = 'error';
            result.logs.push('server name not found');
        }
    }
}
