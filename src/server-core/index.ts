import fs from 'fs';
import http from 'http';
import https from 'https';
import express from 'express';
import config from './config.js';

const app = express();

// index
app.get('/', (request, response, next) => {
    if (request.subdomains.length == 0 || (request.subdomains.length == 1 && request.subdomains[0] == 'www')) {
        response.send('home page');
    } else {
        next();
    }
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

// 404 by the way
app.use((_, response) => {
    response.status(404).end();
});

const privateKey = fs.readFileSync(config["ssl-key"], 'utf-8');
const certificate = fs.readFileSync(config["ssl-cert"], 'utf-8');
const server = https.createServer({ key: privateKey, cert: certificate }, app);
server.listen(443, () => console.log('secure server started at 443'));

const insecureServer = http.createServer((request, response) => {
    response.writeHead(301, { 'Location': 'https://' + request.headers['host'] + request.url });
    response.end();
});
insecureServer.listen(80, () => console.log('insecure server started at 80'));

process.on('SIGINT', () => {
    console.log('server', 'received SIGINT, stop');
    Promise.all([
        new Promise(resolve => server.close(() => resolve())),
        new Promise(resolve => insecureServer.close(() => resolve())),
    ]).then(() => {
        process.exit();
    });
});
