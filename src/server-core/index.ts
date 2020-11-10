import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as express from 'express';

import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
dayjs.extend(utc);

import config from './config.js';
import { templ } from './auth.js';
import * as log from './logger'; // because this module used dayjs.utc in global scope
import { handleRequestHandlerError, handleUnhandledRejection, handleUncaughtException } from './error';

process.on('uncaughtException', handleUncaughtException);
process.on('unhandledRejection', handleUnhandledRejection);

const app = express();

// index
app.get('/', (request, response, next) => {
    if (request.subdomains.length == 0 || (request.subdomains.length == 1 && request.subdomains[0] == 'www')) {
        response.send('home page?');
    } else {
        next();
    }
});

app.get('/make-error', (_, response) => {
    templ();
    response.send('unreachable');
});

// well known
app.use('/.well-known', express.static('./asset/.well-known'));

// subdomains
const staticController = express.Router();
staticController.get('/', (_, response) => {
    response.send('static controller');
});

const driveController = express.Router();
driveController.get('/', (_, response) => {
    response.send('drive controller');
});

const costController = express.Router();
costController.get('/', (_, response) => {
    response.send('cost controller');
});

app.use((request, response, next) => {
    if (request.subdomains.length == 1) {
        if (request.subdomains[0] == 'static') {
            staticController(request, response, next);
        } else if (request.subdomains[0] == 'drive') {
            driveController(request, response, next);
        } else if (request.subdomains[0] == 'cost') {
            costController(request, response, next);
        }
    }
    next();
});

app.use(handleRequestHandlerError);

// 404 by the way
app.use((_, response) => {
    response.status(404).end();
});

const httpServer = http.createServer((request: http.IncomingMessage, response: http.ServerResponse) => {
    response.writeHead(301, { 'Location': 'https://' + request.headers['host'] + request.url }).end();
});
const httpsServer = https.createServer({ 
    key: fs.readFileSync(config['ssl-key'], 'utf-8'), 
    cert: fs.readFileSync(config['ssl-cert'], 'utf-8') 
}, app);

process.on('SIGINT', () => {
    Promise.all([
        new Promise((resolve, reject) => httpServer.close(error => error ? reject(error) : resolve())),
        new Promise((resolve, reject) => httpsServer.close(error => error ? reject(error) : resolve())),
    ]).then(() => {
        console.log('http server and https server closed');
        process.exit(0);
    }).catch((error) => {
        console.log('failed to close some server', error);
        process.exit(1);
    });
});

Promise.all([
    new Promise(resolve => httpServer.listen(80, resolve)),
    new Promise(resolve => httpsServer.listen(443, resolve)),
]).then(() => {
    console.log('http server and http server started');
}).catch(error => {
    console.error('failed to start some server', error);
    process.exit(1);
});

log.info('initialization finished');
