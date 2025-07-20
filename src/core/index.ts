import fs from 'node:fs/promises';
import syncfs from 'node:fs';
import http from 'node:http';
import http2 from 'node:http2';
import net from 'node:net';
import tls from 'node:tls';
import koa from 'koa';
import bodyParser from 'koa-bodyparser';
import type { PoolOptions } from 'mysql2';
import type { AdminInterfaceCommand } from '../shared/admin.js';
import { setupDatabaseConnection } from '../adk/database.js';
import { log } from './logger.js';
import { handleRequestError, handleProcessException, handleProcessRejection } from './error.js';
import type { StaticContentConfig, ShortLinkConfig } from './content.js';
import { setupStaticContent, setupShortLinkService, handleRequestContent, handleContentCommand } from './content.js';
import { handleResponseCompression } from './content.js';
import type { WebappConfig } from './access.js';
import { setupAccessControl, handleRequestCrossOrigin, handleRequestAuthentication, handleAccessCommand } from './access.js';
import { setupForwarding, handleRequestForward, handleForwardCommand } from './forward.js';

const app = new koa();

app.use(handleRequestError);
app.use(handleRequestContent);
app.use(handleRequestCrossOrigin);
app.use(bodyParser());
app.use(handleRequestAuthentication);
app.use(handleResponseCompression);
app.use(handleRequestForward);
app.use(() => { throw new Error('unreachable'); }); // assert route correctly handled

process.on('uncaughtException', handleProcessException);
process.on('unhandledRejection', handleProcessRejection);

const config = JSON.parse(syncfs.readFileSync('config', 'utf-8')) as {
    webroot: string,
    certificates: { [domain: string]: { key: string, cert: string } },
    database: PoolOptions,
    'short-link': ShortLinkConfig,
    'static-content': StaticContentConfig,
    webapps: WebappConfig,
};
setupDatabaseConnection(config.database);
setupShortLinkService(config['short-link']);
await setupStaticContent(config.webroot, config['static-content']);
setupAccessControl(config.webapps);
setupForwarding(config.webapps);

// admin interface
if (syncfs.existsSync('/tmp/fine.socket')) {
    syncfs.unlinkSync('/tmp/fine.socket');
}

const adminServer = net.createServer();
const handleSocketServerError = (error: Error) => {
    console.log(`admin server error: ${error.message}`);
};

const adminInterfaceHandlers = [
    handleContentCommand,
    handleAccessCommand,
    handleForwardCommand,
];
const adminInterfaceConnections: net.Socket[] = [];
adminServer.on('connection', connection => {
    adminInterfaceConnections.push(connection);

    connection.on('close', () => {
        adminInterfaceConnections.splice(adminInterfaceConnections.indexOf(connection), 1);
    });
    connection.on('error', error => {
        console.log(`admin connection error: ${error.message}`);
    });
    connection.on('data', async data => {
        const payload = data.toString('utf-8');
        log.info({ type: 'admin interface received data', payload });
        let command: AdminInterfaceCommand;
        try {
            command = JSON.parse(payload);
        } catch {
            log.error({ type: 'admin interface payload parse failed', payload });
            connection.write(JSON.stringify({ ok: false, log: 'failed to parse payload ' + payload }));
            return;
        }

        if (command.kind == 'ping') {
            connection.write(JSON.stringify({ ok: true, log: 'pong' }));
            return;
        } else if (command.kind == 'shutdown') {
            log.info({ type: 'received shutdown request from admin interface' });
            connection.write(JSON.stringify({ ok: true, log: 'scheduling shutdown' }));
            shutdown();
            return;
        } else {
            for (const handler of adminInterfaceHandlers) {
                const response = await handler(command);
                if (response) {
                    log.info({ type: 'admin interface response', response });
                    connection.write(JSON.stringify(response));
                    return;
                }
            }
        }
        log.info({ type: 'admin interface unhandled command', payload });
        connection.write(JSON.stringify({ ok: false, log: 'unhandled command ' + payload }));
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
    if (shuttingdown) return; 
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
