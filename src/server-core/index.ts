import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as path from 'path';
import * as net from 'net';
import * as express from 'express';
import type { AdminEventEmitter, AdminSocketPayload } from '../shared/types/admin';
import * as log from './logger';
import { config } from './config';
import { handleRequestError } from './error';
import { handle404, handle518, handleIndexPage, handleStaticFiles, handleReload } from './static-files';

const app = express();
const admin: AdminEventEmitter = new EventEmitter();

app.get('/404', handle404); // 404
app.get('/518', handle518); // teapot
app.get('/', handleIndexPage); // index pages
app.get('/:filename', handleStaticFiles); // static files
admin.on('reload', handleReload); // reload index pages or static files

// public files
// every time check file existence and read file and send file
// apply for all 'GET /xxx' and 'GET /xxx/yyy' except for 'static.domain.com'
app.get(/\/.+/, (request, response, next) => {
    const filepath = path.join(process.cwd(), 'dist/public', request.path);
    if (fs.existsSync(filepath)) {
        response.sendFile(filepath, next);
    } else {
        log.info({ type: '404', request: `${request.method} ${request.hostname}${request.url}` });
        response.redirect(301, '/404');
    }
});

// TODO api controller

// final request handler redirect to 404
// // this seems will not happen while unknown static file already returned status 404 
// //    and unknwon public file already redirect to 404 and app front end will captures all url change
app.use((request, response) => {
    if (!response.headersSent) {
        log.info({ type: '404', request: `${request.method} ${request.hostname}${request.url}` });
        response.redirect(301, '/404');
    }
});

// final error handler
app.use(handleRequestError);

// redirect to secure server from insecure server
function handleInsecureRequest(request: http.IncomingMessage, response: http.ServerResponse) {
    response.writeHead(301, { 'Location': 'https://' + request.headers['host'] + request.url }).end();
}

// admin server
const socketServer = net.createServer();
socketServer.on('error', error => {
    console.log(`admin: server error: ${error.message}`);
});

if (fs.existsSync('/tmp/fps.socket')) {
    fs.unlinkSync('/tmp/fps.socket');
}

const socketConnections: net.Socket[] = [];
socketServer.on('connection', connection => {
    socketConnections.push(connection);
    
    connection.on('close', () => {
        socketConnections.splice(socketConnections.indexOf(connection), 1);
    });
    connection.on('error', error => {
        console.log(`admin: connection error: ${error.message}`);
    });
    connection.on('data', data => {
        connection.write('ACK');
        const payload = data.toString('utf-8');
        let message = { type: null } as AdminSocketPayload;
        try {
            message = JSON.parse(payload);
        } catch {
            log.error('failed to parse admin socket payload as json, raw: ' + payload);
        }
        if (message.type == 'shutdown') {
            admin.emit('shutdown');
        } else if (message.type == 'reload') {
            admin.emit('reload', message.parameter);
        }
    });
});

// servers create, start, close
const httpServer = http.createServer(handleInsecureRequest);
const httpsServer = https.createServer({ 
    key: fs.readFileSync(config['ssl-key'], 'utf-8'), 
    cert: fs.readFileSync(config['ssl-cert'], 'utf-8'),
}, app);

const httpConnections: { [key: string]: net.Socket } = {};
httpServer.on('connection', socket => {
    const key = `http:${socket.remoteAddress}:${socket.remotePort}`;
    httpConnections[key] = socket;
    socket.on('close', () => delete httpConnections[key]);
});
httpsServer.on('connection', socket => {
    const key = `https:${socket.remoteAddress}:${socket.remotePort}`;
    httpConnections[key] = socket;
    socket.on('close', () => delete httpConnections[key]);
});

// wait all server started to print only one line
Promise.all([
    new Promise((resolve, reject) => {
        socketServer.once('error', () => reject());
        socketServer.listen('/tmp/fps.socket', resolve);
    }),
    new Promise((resolve, reject) => { 
        httpServer.once('error', error => { console.log(`http server error: ${error.message}`); reject(); }); 
        httpServer.listen(80, resolve); 
    }),
    new Promise((resolve, reject) => {
        httpsServer.once('error', error => { console.log(`https server error: ${error.message}`); reject(); });
        httpsServer.listen(443, resolve);
    }),
]).then(() => {
    console.log('socket server, http server and https server started');
}).catch(() => {
    console.error('failed to start some server');
    process.exit(201);
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
        new Promise((resolve, reject) => socketServer.close(error => {
            if (error) { console.log(`failed to close socket server: ${error.message}`); reject(); } 
            else { resolve(); }
        })),
        new Promise((resolve, reject) => httpServer.close(error => { 
            if (error) { console.log(`failed to close http server: ${error.message}`); reject(); } 
            else { resolve(); }
        })),
        new Promise((resolve, reject) => httpsServer.close(error => {
            if (error) { console.log(`failed to close https server: ${error.message}`); reject(error); }
            else { resolve(); } 
        })),
    ]).then(() => {
        console.log('socket server, http server and https server closed');
        process.exit(0);
    }).catch(() => {
        console.log('failed to close some server');
        process.exit(202);
    });
}

process.on('SIGINT', shutdown);
admin.on('shutdown', shutdown);

log.info('initialization finished?');

// TODO NEXT
// typescript separation build for apps and config, config.ts actually can just rename to config.js to use
//    webpack separation build is simply external
// demo api and api authentication
//    expected to log in at home page and store a refresh token cookie for only <app>.freskyz.com/refresh_token
//    and if call api returned 501 use refresh token to get token and store access token in indexeddb