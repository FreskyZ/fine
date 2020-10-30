import * as fs from 'fs';
import * as https from 'https';
import * as express from 'express';

const app = express();

// index
app.get('/', (request, response, next) => {
    if (request.subdomains.length == 0 || (request.subdomains.length == 1 && request.subdomains[0] == 'www')) {
        response.send('temp server for cert');
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
    console.log('request.subdomains:', request.subdomains);
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

const certificate = fs.readFileSync('<SSL_CERT>', 'utf-8');
const privateKey = fs.readFileSync('<SSL_KEY>', 'utf-8');
const server = https.createServer({ cert: certificate, key: privateKey }, app);
server.listen(443, () => console.log('secure server started at 443'));

process.on('SIGINT', () => {
    console.log('server', 'received SIGINT, stop');
    server.close();
    process.exit();
});
