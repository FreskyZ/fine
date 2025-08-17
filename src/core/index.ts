import fs from 'node:fs/promises';
import syncfs from 'node:fs';
import http from 'node:http';
import http2 from 'node:http2';
import net from 'node:net';
import tls from 'node:tls';
import koa from 'koa';
import bodyParser from 'koa-bodyparser';
import mysql from 'mysql2/promise';
import type { HasId, AdminInterfaceCommand, AdminInterfaceResult } from '../shared/admin-types.js';
import { log } from './logger.js';
import { handleRequestError, handleProcessException, handleProcessRejection } from './error.js';
import type { StaticContentConfig, ServerProviderConfig } from './content.js';
import { setupWebroot, setupStaticContent, setupContentServers } from './content.js';
import { handleRequestContent, handleContentCommand, handleResponseCompression } from './content.js';
import { setupAccessControl, setupDatabase } from './access.js';
import { handleRequestCrossOrigin, handleRequestAuthentication, handleAccessCommand } from './access.js';
import { setupInterProcessActionServers, handleRequestActionServer, handleActionsCommand } from './action.js';

const app = new koa();

app.use(handleRequestError);
app.use(handleRequestContent);
app.use(handleRequestCrossOrigin);
app.use(bodyParser());
app.use(handleRequestAuthentication);
app.use(handleResponseCompression);
app.use(handleRequestActionServer);
app.use(() => { throw new Error('unreachable'); }); // assert route correctly handled

process.on('uncaughtException', handleProcessException);
process.on('unhandledRejection', handleProcessRejection);

const config = JSON.parse(syncfs.readFileSync('config', 'utf-8')) as {
    webroot: string,
    certificates: { [domain: string]: { key: string, cert: string } },
    database: mysql.PoolOptions,
    'static-content': StaticContentConfig,
    servers: ServerProviderConfig,
};
setupWebroot(config.webroot);
await setupStaticContent(config['static-content']);
await setupContentServers(config.servers);
setupDatabase(config.database);
setupAccessControl(config.servers);
setupInterProcessActionServers(config.servers);

// admin interface
if (syncfs.existsSync('/tmp/fine.socket')) {
    await fs.unlink('/tmp/fine.socket');
}

const adminServer = net.createServer();
const handleSocketServerError = (error: Error) => {
    log.error({ cat: 'admin interface', message: 'admin interface socket server error', error });
};

const adminInterfaceHandlers = [
    handleContentCommand,
    handleAccessCommand,
    handleActionsCommand,
];
const adminInterfaceConnections: net.Socket[] = [];
adminServer.on('connection', connection => {
    adminInterfaceConnections.push(connection);
    const sendResponse = (id: number, result: AdminInterfaceResult) => { connection.write(JSON.stringify({ id, ...result })); };

    connection.on('close', () => {
        adminInterfaceConnections.splice(adminInterfaceConnections.indexOf(connection), 1);
    });
    connection.on('error', error => {
        console.log(`admin connection error: ${error.message}`);
    });
    connection.on('data', async data => {
        const payload = data.toString('utf-8');
        log.info({ type: 'admin interface received data', payload });
        let command: AdminInterfaceCommand & HasId;
        try {
            command = JSON.parse(payload);
        } catch {
            log.error({ cat: 'admin interface', message: 'invalid payload', payload });
            sendResponse(0, { status: 'error', logs: ['invalid payload ' + payload] });
            return;
        }

        if (command.kind == 'ping') {
            return sendResponse(command.id, { status: 'ok', logs: ['pong'] });
        } else if (command.kind == 'shutdown') {
            log.info({ cat: 'admin interface', kind: 'shutdown request' });
            sendResponse(command.id, { status: 'ok', logs: ['scheduling shutdown'] });
            shutdown();
            return;
        }
        for (const handler of adminInterfaceHandlers) {
            try {
                const result: AdminInterfaceResult = { status: 'unhandled', logs: [] };
                await handler(command, result);
                if (result.status != 'unhandled') {
                    log.info({ cat: 'admin interface', kind: 'normal result', result });
                    return sendResponse(command.id, result);
                }
            } catch (error) {
                log.error({ cat: 'admin interface', kind: 'handler error', command, error });
                return sendResponse(command.id, { status: 'error', logs: [error] });
            }
        }
        log.error({ cat: 'admin interface', kind: 'unhandled', command });
        return sendResponse(command.id, { status: 'unhandled', logs: [] });
    });
});

const httpServer = http.createServer((request, response) => {
    response.writeHead(301, { location: 'https://' + request.headers.host + request.url }).end();
});

// read all certificate files in one Promise.all should
// be ok for startup performance (even better for original 2 sequential syncfs.readfilesync calls)
const httpsCertificatePaths = Object.values(config.certificates).map(c => [c.key, c.cert]).flat();
const httpsCertificateContents = Object.fromEntries(await Promise.all(
    Array.from(httpsCertificatePaths).map(async path => [path, await fs.readFile(path, 'utf-8')])));
const httpsCertificates = Object.entries(config.certificates)
    .map(([origin, { key, cert }]) => ({ origin, context: tls.createSecureContext({
        key: httpsCertificateContents[key],
        cert: httpsCertificateContents[cert],
    }) }));
const httpsServer = http2.createSecureServer({
    SNICallback: (servername, callback) => {
        const context = httpsCertificates.find(c => c.origin.localeCompare(servername) == 0)?.context;
        if (context) {
            callback(null, context);
        } else {
            callback(new Error('SNI certificate request not found'));
        }
    },
}, app.callback());

const httpConnections: { [key: string]: net.Socket } = {};
httpServer.on('connection', socket => {
    const key = `http:${socket.remoteAddress}:${socket.remotePort}`;
    httpConnections[key] = socket;
    socket.on('error', (error: any) => {
        // according to log, these 2 errors happens kind of frequently (several times a day) while **only** on http socket
        // I guess they are sent by some bad guys or auto guys which supprised by my 301 reponse or http2 server (which are both not very normal behavior)
        // like many tries to connect to something like notebook/admin interface logged in this site Jan 2019 version
        // ignore them
        if (error.code == 'ECONNRESET' && error.syscall == 'read') {
            // ignore
        } else if (error.code == 'ECONNRESET' && error.syscall == 'write') {
            // now you have ECONNRESET + write?
        } else if (error.code == 'HPE_INVALID_METHOD') {
            // ignore
        } else {
            log.error({ type: 'http socket error', error });
        }
    });
    socket.on('close', () => delete httpConnections[key]);
});
httpsServer.on('connection', (socket: net.Socket) => {
    const key = `https:${socket.remoteAddress}:${socket.remotePort}`;
    httpConnections[key] = socket;
    socket.on('error', error => {
        log.error({ type: 'https socket error', error });
    });
    socket.on('close', () => delete httpConnections[key]);
});

// servers start and close // that's how they are implemented braceful
const isSocketActivation = !!process.env['LISTEN_FDS'];
Promise.all([
    new Promise<void>((resolve, reject) => {
        const handleListenError = (error: Error) => {
            console.log(`admin server error: ${error.message}`);
            reject();
        };
        adminServer.once('error', handleListenError);
        adminServer.listen('/tmp/fine.socket', () => {
            adminServer.removeListener('error', handleListenError);
            adminServer.on('error', handleSocketServerError); // install normal error handler after listen success
            resolve();
        });
    }),
    new Promise<void>((resolve, reject) => {
        const handleListenError = (error: Error) => {
            console.log(`http server error: ${error.message}`);
            reject();
        };
        httpServer.once('error', handleListenError);
        // ATTENTION this relies on socket file listen 80 first, and this cannot be automatically checked here
        httpServer.listen(isSocketActivation ? { fd: 3 } : 6001, () => {
            httpServer.removeListener('error', handleListenError);
            httpServer.on('error', error => {
                // wrap and goto uncaught exception
                // // currently this is never reached
                throw new Error('http server error: ' + error.message);
            });
            resolve();
        });
    }),
    new Promise<void>((resolve, reject) => {
        const handleListenError = (error: Error) => {
            console.log(`https server error: ${error.message}`);
            reject();
        };
        httpsServer.once('error', handleListenError);
        // ATTENTION this relies on socket file listen 80 then 443, and this cannot be automatically checked here
        httpsServer.listen(isSocketActivation ? { fd: 4 } : 6002, () => {
            httpsServer.removeListener('error', handleListenError);
            httpsServer.on('error', error => {
                throw new Error('https server error: ' + error.message);
            });
            resolve();
        });
    }),
]).then(() => {
    log.info('fine startup complete');
    console.log('fine startup complete');
}).catch(() => {
    console.error('fine startup failed');
    process.exit(101);
});

let shuttingdown = false;
function shutdown() {
    if (shuttingdown) { return; }
    shuttingdown = true; // prevent reentry

    setTimeout(() => {
        console.log('fine shutdown timeout, abort');
        process.exit(102);
    }, 30_000);

    // destroy connections
    for (const socket of adminInterfaceConnections) {
        socket.destroy();
    }
    for (const key in httpConnections) {
        httpConnections[key].destroy();
    }

    // wait all server close
    Promise.all([
        new Promise<void>((resolve, reject) => adminServer.close(error => {
            if (error) { console.log(`failed to close socket server: ${error.message}`); reject(); }
            else { resolve(); }
        })),
        new Promise<void>((resolve, reject) => httpServer.close(error => {
            if (error) { console.log(`failed to close http server: ${error.message}`); reject(); }
            else { resolve(); }
        })),
        new Promise<void>((resolve, reject) => httpsServer.close(error => {
            if (error) { console.log(`failed to close http2 server: ${error.message}`); reject(error); }
            else { resolve(); }
        })),
    ]).then(() => {
        log.info('fine shutdown');
        console.log('fine shutdown');
        process.exit(0);
    }, () => {
        console.log('fine shutdown with error');
        process.exit(102);
    });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
