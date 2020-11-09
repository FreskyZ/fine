import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as express from 'express';
import { SourceMapConsumer } from 'source-map';
import config from './config.js';
import { templ } from './auth.js';

import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
dayjs.extend(utc);

import * as log from './logger'; // because this module used dayjs.utc in global scope

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

let sourceMap: SourceMapConsumer; 
new SourceMapConsumer(JSON.parse(fs.readFileSync('dist/home/server.js.map', 'utf-8'))).then(sm => sourceMap = sm, ex => console.log(`parse source map failed: ${ex}`));

app.use(async (error: { message: string, stack: string }, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    console.log(`request handler error: ${error.message}`);
    const rawFrames = error.stack.split('\n').slice(1); // first row is error
    for (const rawFrame of rawFrames) {
        const frame = rawFrame.trim().slice(3); // trim 'at '

        const match1 = regex1.exec(frame);
        if (match1) {
            const structured = ['name', 'asName', 'file', 'line', 'column'].map(n => `${n}: ${match1.groups[n]}`).join(', ');
            console.log(`structured {${structured}}`);
            if (sourceMap && match1.groups['line'] && match1.groups['column']) {
                const { line, column, source } = sourceMap.originalPositionFor({ line: parseInt(match1.groups['line']), column: parseInt(match1.groups['column']) });
                if (line != null && column != null) {
                    console.log(`   original: ${source}:${line}:${column}`);
                }
            }
        } else {
            const match2 = regex2.exec(frame);
            if (match2) {
                const structured = ['file', 'line', 'column'].map(n => `${n}: ${match2.groups[n]}`).join(', ');
                console.log(`structured {${structured}}`);
                if (sourceMap && match2.groups['line'] && match2.groups['column']) {
                    const { line, column, source } = sourceMap.originalPositionFor({ line: parseInt(match2.groups['line']), column: parseInt(match2.groups['column']) });
                    if (line != null && column != null) {
                        console.log(`   original: ${source}:${line}:${column}`);
                    }
                }
            } else {
                console.log(`frame (unknown structure) ${frame}`);
            }
        }
    }

    response.status(500).end();
});

// 404 by the way
app.use((_, response) => {
    response.status(404).end();
});

const privateKey = fs.readFileSync(config['ssl-key'], 'utf-8');
const certificate = fs.readFileSync(config['ssl-cert'], 'utf-8');
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
    ]).finally(() => {
        process.exit();
    });
});

log.info('initialization finished');