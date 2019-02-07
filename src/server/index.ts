import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as https from 'https';
import express from 'express';
import config from './config';
import DynamicAssetLoader from './asset_loader';
import SehuController from './sehu';

const logger = console;

let app = express();

const redirect_404 = (request: express.Request, response: express.Response) => {
    logger.log(`${request.method} ${request.url}: failed and redirect to /404`);
    response.redirect('/404');
};

const rootRouteMapper = (name: string) => name == 'index.html' ? '' : name == '404.html' ? '404' : name;
const rootWatcher = new DynamicAssetLoader('/', rootRouteMapper).setup(app).startWatch();
const appWatcher = new DynamicAssetLoader('/app', name => path.basename(name, '.html')).setup(app).startWatch();
const staticWatcher = new DynamicAssetLoader('/static').setup(app).startWatch();

// api controllers
app.use('/api/sehu', SehuController);

// default to 404
app.use((request, response, _next) => {
    if (request.accepts('html')) {
        redirect_404(request, response);
    }
});

process.on('SIGINT', () => {
    logger.log('[server] received SIGINT, start finalize');

    logger.log('[server] finalizing, closing servers');
    secureServer.close();
    insecureServer.close();

    logger.log('[server] finalizing, closing watchers');
    rootWatcher.stopWatch();
    appWatcher.stopWatch();
    staticWatcher.stopWatch();
});


const ssl_key_file = fs.readFileSync(config['ssl-key']);
const ssl_cert_file = fs.readFileSync(config['ssl-cert']);
const secureServer = https.createServer({ key: ssl_key_file, cert: ssl_cert_file }, app);
logger.log('[server] starting secure server on port 443');
secureServer.listen(443);

// redirect to https if http
const insecureServer = http.createServer((request, response) => {
    response.writeHead(301, { 'Location': 'https://' + request.headers['host'] + request.url });
    response.end();
});
logger.log('[server] starting insecure server on port 80');
insecureServer.listen(80);

