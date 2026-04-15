import fs from 'node:fs/promises';
import syncfs from 'node:fs';
import http from 'node:http';
import http2 from 'node:http2';
import net from 'node:net';
import path from 'node:path';
import tls from 'node:tls';
import koa from 'koa';
import bodyParser from 'koa-bodyparser';
import type { PoolConfig } from 'pg';
import yaml from 'yaml';
import type { HasId, AdminInterfaceCommand, AdminInterfaceResult } from '../shared/admin-types.js';
import { log } from './logger.js';
import { handleRequestError, handleProcessException, handleProcessRejection } from './error.js';
import { setupContentControl, handleRequestContent, handleContentCommand, handleResponseCompression } from './content.js';
import type { ServerProviderConfig } from './access.js';
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

await setupContentControl();
const config = JSON.parse(syncfs.readFileSync('/etc/fine/config.json', 'utf-8')) as {
    database: PoolConfig,
    servers: ServerProviderConfig,
};
setupDatabase(config.database);
setupAccessControl(config.servers);
setupInterProcessActionServers(config.servers);

// admin interface
const socketpath = path.resolve(process.env['FINE_SOCKET_DIR'] ?? '', 'fine.socket');
if (syncfs.existsSync(socketpath)) {
    await fs.unlink(socketpath);
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

    const sendResponse = (id: number, result: AdminInterfaceResult) => {
        if (Array.isArray(result.logs)) {
            for (let index = 0; index < result.logs.length; index += 1) {
                if (result.logs[index] instanceof Error) {
                    // error by default is not stringified because these properties are enumerable: false
                    result.logs[index] = {
                        name: result.logs[index].name,
                        message: result.logs[index].message,
                        stack: result.logs[index].stack,
                    };
                }
            }
        }
        connection.write(JSON.stringify({ id, ...result }));
    };
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
        } else if (command.kind == 'reload-certificate') {
            await setupCertificates();
            return sendResponse(command.id, { status: 'ok', logs: ['reloaded certificates', httpsCertificates] });
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

const domainsConfigPath = path.resolve(process.env['FINE_CONFIG_DIR'] ?? '', 'domains.yml');
let httpsCertificates: { domain: string, context: tls.SecureContext }[] = [];
async function setupCertificates() {
    // only domain name (object keys) is used here, so no need to write complete type
    const domains = Object.keys(yaml.parse(await fs.readFile(domainsConfigPath, 'utf-8')));

    // TODO do I need fullchain for now?
    const getKeyFilePath = (n: string) => `/etc/letsencrypt/live/${n}/privkey.pem`;
    const getCertFilePath = (n: string) => `/etc/letsencrypt/live/${n}/fullchain.pem`;
    const files = domains.map(domain => [getKeyFilePath(domain), getCertFilePath(domain)]).flat();

    // tolerate read file error, one certificate error should not affect other domains
    const contents = Object.fromEntries((await Promise.all(files.map(async path => {
        try {
            return [path, await fs.readFile(path)] as const;
        } catch (error) {
            log.error({ cat: 'certificate', kind: 'read certificate error', path: path, error });
            return null;
        }
    }))).filter(x => x));

    httpsCertificates = domains.map(domain => {
        const [keyPath, certPath] = [getKeyFilePath(domain), getCertFilePath(domain)];
        if (!contents[keyPath]) {
            log.error({ cat: 'certificate', message: 'skip origin because read certificate error', domain, keyPath });
            return null;
        } else if (!contents[certPath]) {
            log.error({ cat: 'certificate', message: 'skip origin because read certificate error', domain, certPath });
            return null;
        }
        return { domain, context: tls.createSecureContext({ key: contents[keyPath], cert: contents[certPath] }) };
    }).filter(x => x);
}
await setupCertificates();

const httpServer = http.createServer((request, response) => {
    response.writeHead(301, { location: 'https://' + request.headers.host + request.url }).end();
});
const httpsServer = http2.createSecureServer({
    SNICallback: (servername, callback) => {
        const splitted = servername.split('.');
        if (splitted.length < 2) {
            callback(new Error('SNI certificate request not found'));
        } else {
            const domain = `${splitted.at(-2)}.${splitted.at(-1)}`;
            const context = httpsCertificates.find(c => c.domain.localeCompare(domain) == 0)?.context;
            if (context) {
                callback(null, context);
            } else {
                callback(new Error('SNI certificate request not found'));
            }
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
Promise.all([
    new Promise<void>((resolve, reject) => {
        const handleListenError = (error: Error) => {
            console.log(`admin server error: ${error.message}`);
            reject();
        };
        adminServer.once('error', handleListenError);
        adminServer.listen(socketpath, () => {
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
        httpServer.listen(80, () => {
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
        httpsServer.listen(443, () => {
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
