import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as path from 'path';
import * as net from 'net';
import * as express from 'express';

import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
dayjs.extend(utc);

import config from './config.js';
import * as log from './logger'; // because this module used dayjs.utc in global scope
import { handleRequestHandlerError, handleUnhandledRejection, handleUncaughtException } from './error';

process.on('uncaughtException', handleUncaughtException);
process.on('unhandledRejection', handleUnhandledRejection);

const app = express();
const rootDirectory = process.cwd();
const distDirectory = path.join(rootDirectory, 'dist');
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

// GET /
// different subdomains gets different file, reload-able cached html content
type IndexFiles = { [subdomain: string]: { filepath: string, content: string | null } }
const indexFiles: IndexFiles = (() => {
    const indexFiles: IndexFiles = {}; // this amazingly works
    // 2 home page properties (domain.com and www.domain.com) share same value to prevent duplicate fs read
    const homePageEntry = { filepath: path.join(distDirectory, 'home/index.html'), content: null as string };
    for (const subdomain of ['www', 'undefined']) { // 'undefined' create by `${subdomain[0]}` when subdomain list is empty
        indexFiles[subdomain] = homePageEntry;
    }
    for (const name of ['cost', 'drive']) {
        indexFiles[name] = { filepath: path.join(distDirectory, `${name}/index.html`), content: null };
    }
    return indexFiles;
})();
app.get('/', (request, response, next) => {
    const key = `${request.subdomains[0]}`;
    if (key in indexFiles) {
        if (indexFiles[key].content === null) {
            indexFiles[key].content = fs.readFileSync(indexFiles[key].filepath, 'utf-8');
        }
        response.contentType('html').send(indexFiles[key].content).end();
    } else {
        next(); // this currently will not happen and if happen will goto 404
    }
});

// GET static.domain.com/xxx
// reload-able cached js/json/css content
// amazingly <script> tag and <link rel="stylesheet"> tag defaults to ignore cross origin check
type StaticFiles = { [filename: string]: { filepath: string, contentType: string, content: string | null } }
const staticFiles: StaticFiles = (() => {
    const staticFiles: StaticFiles = {};
    staticFiles['index.js'] = { filepath: path.join(distDirectory, 'home/client.js'), contentType: 'js', content: null }; // only home page index js does not have source map
    staticFiles['index.css'] = { filepath: path.join(distDirectory, 'home/index.css'), contentType: 'css', content: null };
    for (const name of ['cost', 'drive']) {
        staticFiles[`${name}.js`] = { filepath: path.join(distDirectory, `${name}/client.js`), contentType: 'js', content: null };
        staticFiles[`${name}.js.map`] = { filepath: path.join(distDirectory, `${name}/client.js.map`), contentType: 'json', content: null };
        staticFiles[`${name}.css`] = { filepath: path.join(distDirectory, `${name}/index.css`), contentType: 'css', content: null };
    }
    return staticFiles;
})();
app.get('/:filename', (request, response, next) => {
    if (request.subdomains[0] !== 'static') { // also correct for subdomains array is empty
        next();
    } else if (!(request.params['filename'] in staticFiles)) {
        response.sendStatus(404).end(); // unknown static file is status 404 instead of 404 html page
    } else {
        const entry = staticFiles[request.params['filename']];
        if (entry.content === null) {
            entry.content = fs.readFileSync(entry.filepath, 'utf-8');
        }
        response.contentType(entry.contentType).send(entry.content).end();
    }
});

// public
// every time check file existence and read file and send file
// apply for all 'GET /xxx' and 'GET /xxx/yyy' except for 'static.domain.com'
app.get(/\/.+/, (request, response, next) => {
    const filepath = path.join(publicDirectory, request.path);
    if (fs.existsSync(filepath)) {
        response.sendFile(filepath, next);
    } else {
        response.redirect(301, '/404');
    }
});

// TODO api controller

// final request handler redirect to 404
// // this seems will not happen while unknown static file already returned status 404 
// //    and unknwon public file already redirect to 404 and app front end will captures all url change
app.use((_, response) => {
    if (!response.headersSent) {
        response.redirect(301, '/404');
    }
});

// final error handler
app.use(handleRequestHandlerError);

// start and close servers
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
