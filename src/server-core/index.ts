import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as path from 'path';
import * as net from 'net';
import * as express from 'express';
import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
dayjs.extend(utc);

// because my js files may use dayjs.utc in global scope
import config from './config.js';
import * as log from './logger'; 
import { requestErrorHandler } from './error';
import { indexHandler, staticHandler } from './static-files';

const app = express();
const rootDirectory = process.cwd();
const publicDirectory = path.join(rootDirectory, 'dist/public');

// GET /404 and GET /518
// return non-reload-able static stand alone html text
const html404 = fs.readFileSync(path.join(rootDirectory, 'dist/home/404.html'), 'utf-8');
const html518 = fs.readFileSync(path.join(rootDirectory, 'dist/home/518.html'), 'utf-8');
app.get('/404', (_request, response) => {
    response.contentType('html').send(html404).end();
});
app.get('/518', (_request, response) => {
    response.contentType('html').send(html518).end();
});

app.get('/', indexHandler);
app.get('/:filename', staticHandler);

// public
// every time check file existence and read file and send file
// apply for all 'GET /xxx' and 'GET /xxx/yyy' except for 'static.domain.com'
app.get(/\/.+/, (request, response, next) => {
    const filepath = path.join(publicDirectory, request.path);
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
app.use(requestErrorHandler);

// servers create, start, close
const httpServer = http.createServer((request: http.IncomingMessage, response: http.ServerResponse) => {
    response.writeHead(301, { 'Location': 'https://' + request.headers['host'] + request.url }).end();
});
const httpsServer = https.createServer({ 
    key: fs.readFileSync(config['ssl-key'], 'utf-8'), 
    cert: fs.readFileSync(config['ssl-cert'], 'utf-8') 
}, app);

const connections: { [key: string]: net.Socket } = {};
httpServer.on('connection', socket => {
    const key = `http:${socket.remoteAddress}:${socket.remotePort}`;
    connections[key] = socket;
    socket.on('close', () => delete connections[key]);
});
httpsServer.on('connection', socket => {
    const key = `https:${socket.remoteAddress}:${socket.remotePort}`;
    connections[key] = socket;
    socket.on('close', () => delete connections[key]);
});

process.on('SIGINT', () => {
    for (const key in connections) {
        connections[key].destroy(); // force destroy connections to allow server close
    }
    Promise.all([
        new Promise((resolve, reject) => httpServer.close(error => error ? reject(error) : resolve())),
        new Promise((resolve, reject) => httpsServer.close(error => error ? reject(error) : resolve())),
    ]).then(() => {
        console.log('http server and https server closed');
        process.exit(0);
    }).catch((error) => {
        console.log('failed to close some server', error);
        process.exit(202);
    });
});

Promise.all([
    new Promise((resolve, reject) => { 
        httpServer.once('error', error => { 
            console.log(`http server error: ${error.message}`); 
            reject(); 
        }); 
        httpServer.listen(80, resolve); 
    }),
    new Promise((resolve, reject) => {
        httpsServer.once('error', error => {
            console.log(`https server error: ${error.message}`);
            reject();
        });
        httpsServer.listen(443, resolve);
    }),
]).then(() => {
    console.log('http server and http server started');
}).catch(() => {
    console.error('failed to start some server');
    process.exit(201);
});

log.info('initialization finished');
