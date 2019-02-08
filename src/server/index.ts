import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as https from 'https';
import express from 'express';
import config from './config';
import { setupLogger } from './logger';
import { setupAssets } from './asset_loader';
import SehuController from './sehu';

let app = express();

setupLogger(app);

const assets = setupAssets(app, [
    { route: '/', mapper: (name: string) =>
        name == 'index.html' ? '' : name.endsWith('.html') ? path.basename(name, '.html') : name },
    { route: '/app', mapper: 'remove-ext' },
    { route: '/static', mapper: 'default' },
]);

// api controllers
app.use('/api/sehu', SehuController);

// default to 404
app.use((request, response, _next) => {
    if (request.accepts('html')) {
        response.redirect('/404');
    }
});

// start servers
const ssl_key_file = fs.readFileSync(config['ssl-key']);
const ssl_cert_file = fs.readFileSync(config['ssl-cert']);
const secureServer = https.createServer({ key: ssl_key_file, cert: ssl_cert_file }, app);
console.log('[server] starting secure server on port 443');
secureServer.listen(443);

// redirect to https if http
const insecureServer = http.createServer((request, response) => {
    response.writeHead(301, { 'Location': 'https://' + request.headers['host'] + request.url });
    response.end();
});
console.log('[server] starting insecure server on port 80');
insecureServer.listen(80);

// close servers
process.on('SIGINT', () => {
    console.log('[server] received SIGINT, start finalize');

    console.log('[server] finalizing, closing servers');
    secureServer.close();
    insecureServer.close();

    console.log('[server] finalizing, closing watchers');
    assets.map(a => a.stopWatch());
});

