import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as http from 'http';
import * as http2 from 'http2';
import * as net from 'net';
import * as Koa from 'koa';
import * as bodyParser from 'koa-bodyparser';
import type { AdminEventEmitter, AdminPayload } from '../shared/types/admin';
import { MyError } from '../shared/error';
import { logInfo, logError } from './logger';
import { handleRequestContent, handleAdminReloadStatic, handleAdminConfigDevMod } from './content';
import { handleRequestError, handleProcessException, handleProcessRejection } from './error';
import type { ContextState } from './auth';
import { handleRequestAccessControl, handleRequestAuthentication, handleApplications } from './auth'; // request handler
import { handleAdminReloadServer, handleAdminExpireDevice } from './auth'; // admin handler

const app = new Koa<ContextState>();
const admin: AdminEventEmitter = new EventEmitter();

app.use(handleRequestError);
app.use(handleRequestContent);
app.use(handleRequestAccessControl);
app.use(bodyParser());
app.use(handleRequestAuthentication);
app.use(handleApplications);
app.use(() => { throw new MyError('unreachable'); }); // assert route correctly handled

admin.on('reload-static', handleAdminReloadStatic);
admin.on('config-devmod', handleAdminConfigDevMod);
admin.on('reload-server', handleAdminReloadServer);
admin.on('expire-device', handleAdminExpireDevice);
process.on('uncaughtException', handleProcessException);
process.on('unhandledRejection', handleProcessRejection);

// redirect to secure server from insecure server
function handleInsecureRequest(request: http.IncomingMessage, response: http.ServerResponse) {
    response.writeHead(301, { 'Location': 'https://' + request.headers['host'] + request.url }).end();
}

// admin server
if (fs.existsSync('/tmp/fps.socket')) {
    fs.unlinkSync('/tmp/fps.socket');
}

const socketServer = net.createServer();
const handleSocketServerError = (error: Error) => {
    console.log(`admin server error: ${error.message}`);
};

const socketConnections: net.Socket[] = [];
socketServer.on('connection', connection => {
    socketConnections.push(connection);
    
    connection.on('close', () => {
        socketConnections.splice(socketConnections.indexOf(connection), 1);
    });
    connection.on('error', error => {
        console.log(`admin connection error: ${error.message}`);
    });
    connection.on('data', data => {
        const payload = data.toString('utf-8');
        let message = { type: null } as AdminPayload;
        try {
            message = JSON.parse(payload);
        } catch {
            logError({ type: 'parse admin payload', payload });
        }
        // ACK after data decoded or else data seems to be discarded after that end closed
        connection.write('ACK');

        if (message.type == 'shutdown') {
            admin.emit('shutdown');
        } else if (message.type == 'reload-static') {
            admin.emit('reload-static', message.key);
        } else if (message.type == 'config-devmod') {
            admin.emit('config-devmod', message.sourceMap, message.websocketPort);
        } else if (message.type == 'reload-server') {
            admin.emit('reload-server', message.app);
        } else if (message.type == 'expire-device') {
            admin.emit('expire-device', message.deviceId);
        }
    });
});

// http server
const httpServer = http.createServer(handleInsecureRequest);
const http2Server = http2.createSecureServer({ 
    key: fs.readFileSync("SSL_KEY", 'utf-8'), 
    cert: fs.readFileSync("SSL_CERT", 'utf-8'),
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
        }
        logError({ type: 'http socket error', error });
    });
    socket.on('close', () => delete httpConnections[key]);
});
http2Server.on('connection', (socket: net.Socket) => {
    const key = `https:${socket.remoteAddress}:${socket.remotePort}`;
    httpConnections[key] = socket;
    socket.on('error', error => {
        logError({ type: 'http2 socket error', error });
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
        socketServer.once('error', handleListenError);
        socketServer.listen('/tmp/fps.socket', () => {
            socketServer.removeListener('error', handleListenError);
            socketServer.on('error', handleSocketServerError); // install normal error handler after listen success
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
            console.log(`http2 server error: ${error.message}`); 
            reject(); 
        };
        http2Server.once('error', handleListenError);
        http2Server.listen(443, () => {
            http2Server.removeListener('error', handleListenError);
            http2Server.on('error', error => {
                throw new Error('http2 server error: ' + error.message);
            }); 
            resolve();
        });
    }),
]).then(() => {
    logInfo('server core startup');
    console.log('server core startup');
}).catch(() => {
    console.error('server core startup failed');
    process.exit(101);
});

let shuttingdown = false;
function shutdown() {
    if (shuttingdown) return; shuttingdown = true; // prevent reentry

    // destroy connections
    for (const socket of socketConnections) {
        socket.destroy();
    }
    for (const key in httpConnections) {
        httpConnections[key].destroy();
    }

    // wait all server close
    Promise.all([
        new Promise<void>((resolve, reject) => socketServer.close(error => {
            if (error) { console.log(`failed to close socket server: ${error.message}`); reject(); } 
            else { resolve(); }
        })),
        new Promise<void>((resolve, reject) => httpServer.close(error => { 
            if (error) { console.log(`failed to close http server: ${error.message}`); reject(); } 
            else { resolve(); }
        })),
        new Promise<void>((resolve, reject) => http2Server.close(error => {
            if (error) { console.log(`failed to close http2 server: ${error.message}`); reject(error); }
            else { resolve(); } 
        })),
    ]).then(() => {
        logInfo('server core shutdown');
        console.log('server core shutdown');
        process.exit(0);
    }, () => {
        console.log('server core shutdown with error');
        process.exit(102);
    });
}

process.on('SIGINT', shutdown);
admin.on('shutdown', shutdown);
