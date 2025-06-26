import net from 'node:net';
import type { ForwardContext } from '../adk/api-server.js';
import { MyError } from './error.js';
import { log } from './logger.js';
import { AuthContext, WebappConfig } from './auth.js';

// forward api invocations to services, with pooled connections

type PoolItem = {
    connection: net.Socket,
    state: 'uninit' | 'available' | 'acquired',
}
type Pool = {
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
const pools = Object.fromEntries<Pool>(appsetting.map(a => [a.name, { waits: [],
    // need to fill air into the array or else the items are vaccum, then the map call maps nothing
    items: new Array<void>(POOL_SIZE).fill().map<PoolItem>(() => ({ state: 'uninit', connection: null })) }]));

async function acquire(app: string, pool: Pool, requestDisplay: string): Promise<net.Socket> {

    for (const item of pool.items) {
        if (item.state == 'uninit') {
            // immediatetely set state, this should be atomic enough
            item.state = 'acquired';
            await initializePoolItem(app, item);
            return item.connection;
        } else if (item.state == 'available') {
            item.state = 'acquired';
            return item.connection;
        }
    }

    // too more
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
    async function initializePoolItem(app: string, item: PoolItem) {
        return new Promise<void>((resolve, reject) => {
            item.connection = new net.Socket();
            item.connection.once('connect', () => {
                resolve();
                item.connection.on('error', error => {
                    logError(`${requestDisplay}: ` + error.message);
                    cleanupItem(item);
                });
            });
    
            // this once error is initial connection error
            // normally caused by service not start: ENOENT (file not exist)
            item.connection.once('error', error => {
                logError(`${requestDisplay}: ` + error.message);
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
            // the .find will not fail because app is
            // already checked by allowedOrigins (auth.ts) and they come from the same APPSETTING
            item.connection.connect(appsetting.find(a => a.name == app).socket);
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

export async function handleRequestForward(ctx: AuthContext): Promise<void> {
    // handleRequestAccessControl already checked origin is allowed and assigned known state.app
    if (!ctx.state.app) { throw new MyError('unreachable'); }
    // an known origin can only call its own '/:app/...'
    if (!ctx.path.startsWith('/' + ctx.state.app)) { throw new MyError('not-found', 'invalid-invocation'); }
    // log header
    const requestDisplay = `request ${ctx.method} ${ctx.host}${ctx.url} (${JSON.stringify(ctx.state)})`;

    // pools and allowedOrigins initialized from same data source so must exist
    const pool = pools[ctx.state.app];
    const connection = await acquire(ctx.state.app, pool, requestDisplay);

    return new Promise((resolve, reject) => {

        // timeout 1 min for normal request
        const timeout = setTimeout(() => {
            logError(`${requestDisplay} timeout`);
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
                logError(`failed to parse response: ${error}: ${dataString}`);
                reject(new MyError('bad-gateway', 'failed to parse response'));
                return;
            }
            if (response.error) {
                reject(response.error);
                return;
            }
            ctx.status = response.status || 200;
            if (response.body) {
                ctx.body = response.body;
            }
            resolve();
            release(pool, connection);
        });

        connection.write(JSON.stringify({
            method: ctx.method,
            path: ctx.path.substring(ctx.state.app.length + 1),
            body: ctx.request.body,
            state: ctx.state,
        }));
    });
}
