///<reference path="../types/stacktrace-js.d.ts"/>

import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as https from 'https';
import express from 'express';
import * as SourceMap from 'source-map';
import * as StackTrace from 'stacktrace-js';
import config from './config';
import logger, { setupLogFileAPI, logger_dummy } from './logger';
import { setupAssets } from './asset';
import { setup as setupAuthAPI } from './auth';
import SehuController from './api/sehu';

Error.stackTraceLimit = 100;
const runtimeExecutableFullPath = process.argv[1];
const stackFrameFilter = (f: StackTrace.StackFrame): boolean =>
    f.fileName == runtimeExecutableFullPath && f.lineNumber !== undefined && f.columnNumber !== undefined;

process.on('uncaughtException', err => {
    Promise.all([
        StackTrace.fromError(err, { filter: stackFrameFilter }),
        new SourceMap.SourceMapConsumer(fs.readFileSync(runtimeExecutableFullPath + '.map').toString())
    ]).then(([frames, sourceMap]) => {
        for (const { lineNumber: generatedLine, columnNumber: generatedColumn } of frames) {
            const { source: originalFileName, line: originalLine, column: originalColumn}
                = sourceMap.originalPositionFor({ line: generatedLine!, column: generatedColumn! });
            console.log(`   generated ${generatedLine}:${generatedColumn} `
                + `from original ${originalFileName}:${originalLine}:${originalColumn}`);
       }
        process.exit(1);
    });
});


function index_dummy(): void {
    logger_dummy(() => {
        console.log('hello, bye'); throw new Error('unknown exception');
    });
}
index_dummy();

let app = express();

setupAuthAPI(app);
setupLogFileAPI(app);
const assets = setupAssets(app, [
    { route: '/', mapper: (name: string) =>
        name == 'index.html' ? '' : name.endsWith('.html') ? path.basename(name, '.html') : name },
    { route: '/app', mapper: 'remove-ext' },
    { route: '/static', mapper: 'default' },
]);

// api
app.use('/api/sehu', SehuController);

// default to 404
app.use((request, response, _next) => {
    if (request.accepts('html')) {
        logger.error('request', `${request.method} ${request.url}: route not exist, redirect to /404`);
        response.redirect('/404');
    } else {
        logger.error('request', `${request.method} ${request.url}: route not exist, return 404`);
        response.status(404).end();
    }
});

// start servers
const ssl_key_file = fs.readFileSync(config['ssl-key']);
const ssl_cert_file = fs.readFileSync(config['ssl-cert']);
const secureServer = https.createServer({ key: ssl_key_file, cert: ssl_cert_file }, app);
logger.info('server', ' starting secure server on port 443');
secureServer.listen(8001);

// redirect to https if http
const insecureServer = http.createServer((request, response) => {
    response.writeHead(301, { 'Location': 'https://' + request.headers['host'] + request.url });
    response.end();
});
logger.info('server', 'starting insecure server on port 80');
insecureServer.listen(8002);

// print something on console so that journalctl can confirm normal init process finished
console.log('server started, view /logs for more info');

// close servers
process.on('SIGINT', () => {
    logger.info('server', 'received SIGINT, start finalize');

    logger.info('server', 'closing servers');
    secureServer.close();
    insecureServer.close();

    logger.info('server', 'closing watchers');
    assets.map(a => a.stopWatch());
});

