import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as express from 'express';
import config from './config.js';
import { templ } from './auth.js';

import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
dayjs.extend(utc);

import * as log from './logger'; // because this module used dayjs.utc in global scope
import { handleRequestHandlerError, handleUnhandledRejection, handleUncaughtException } from './error';

process.on('uncaughtException', handleUncaughtException);
process.on('unhandledRejection', handleUnhandledRejection);

const app = express();

// index
app.get('/', (request, response, next) => {
    if (request.subdomains.length == 0 || (request.subdomains.length == 1 && request.subdomains[0] == 'www')) {
        response.send('home page');
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

const privateKey = fs.readFileSync(config['ssl-key'], 'utf-8');
const certificate = fs.readFileSync(config['ssl-cert'], 'utf-8');
const server = https.createServer({ key: privateKey, cert: certificate }, app);
server.listen(443, () => console.log('https server started at :443'));

const insecureServer = http.createServer((request, response) => {
    response.writeHead(301, { 'Location': 'https://' + request.headers['host'] + request.url }).end();
});
insecureServer.listen(80, () => console.log('http server started at 800'));

process.on('SIGINT', () => {
    console.log('server', 'received SIGINT, stop');
    server.close(() => console.log('https server closed'));
    insecureServer.close(() => console.log('http server closed'));
    process.exit();
});

log.info('initialization finished');