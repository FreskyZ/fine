import * as fs from 'fs';
import * as path from 'path';
import moment from 'moment';
import express from 'express';
import SehuController from './sehu';

const port = 80;

const logger = console;
const format_log_time = (time: Date) => moment(time).format('Y-M-D HH:mm:ss:sss Z');

let app = express();

const root_directory = process.cwd();
const static_directory = path.join(root_directory, 'static');

// you can find ".index.html.swp", "4913", "index.html~", etc. strange file names in file system watcher
// so limit it to white list extensions
// note that '.js.map' makes you use String.prototype.endsWith not path.extname
const static_asset_extensions = ['.html', '.js', '.js.map', '.css', '.ico'];

// index page, GET / => ./static/index.html
const index_html_path = path.join(static_directory, 'index.html');
let [index_html_mtime, index_html_content] = [0, Buffer.from('')];
const load_index_html = (initial: boolean) => {
    const stat = fs.statSync(index_html_path);
    if (stat.mtimeMs == index_html_mtime) return;

    index_html_mtime = stat.mtimeMs;
    index_html_content = fs.readFileSync(index_html_path);
    logger.log(`${initial ? '' : 're'}loaded index.html, size ${stat.size}, mtime ${format_log_time(stat.mtime)}`);
};
load_index_html(true);
app.get('/', (_request, response) => {
    response.header('Content-Type', 'text/html').send(index_html_content);
});

// 404 page, GET /404 => 。/static/404.html
const _404_path = path.join(static_directory, '404.html');
const _404_stat = fs.statSync(_404_path);
const _404_content = fs.readFileSync(_404_path);
logger.log(`loaded 404.html, size ${_404_stat.size}, mtime ${format_log_time(_404_stat.mtime)}`);
app.get('/404', (_request, response) => response.header('Content-Type', 'text/html').send(_404_content));
const redirect_404 = (request: express.Request, response: express.Response) => {
    logger.log(`${request.method} ${request.url}: failed and redirect to /404`);
    response.redirect('/404');
};

// apps, GET /app/:name => ./static/name.html
// static assets, GET /static/:name.xxx => ./static/name.xxx

interface StringMap { [name: string]: { content: Buffer, mtime: number } }
const static_app_contents: StringMap = {};
const static_file_contents: StringMap = {};
const load_static_asset = (asset_name: string, initial: boolean) => {

    if (asset_name == '404.html') return;
    if (asset_name == 'index.html') {
        if (!initial) load_index_html(false);
        return;
    }

    const asset_path = path.join(static_directory, asset_name);
    const stat = fs.statSync(asset_path);

    // ignore change size to 0, webpack will clear content and then write content, don't ask me why
    if (stat.size == 0) return;

    const content = fs.readFileSync(asset_path);

    if (path.extname(asset_name) == '.html') {
        const app_name = path.basename(asset_name, '.html');
        const app_exists = app_name in static_app_contents;

        // ignore same mtime
        if (app_exists && static_app_contents[app_name].mtime == stat.mtimeMs) return;

        static_app_contents[path.basename(asset_name, '.html')] = {
            content: fs.readFileSync(asset_path),
            mtime: stat.mtimeMs
        };
        logger.log((initial || !app_exists ? '' : 're')
            + `loaded static/${asset_name}, size ${stat.size}, mtime ${format_log_time(stat.mtime)}`);
    } else {
        // ignore same mtime
        const asset_exists = asset_name in static_file_contents;
        if (asset_exists && static_file_contents[asset_name].mtime == stat.mtimeMs) return;

        static_file_contents[asset_name] = { content, mtime: stat.mtimeMs };
        logger.log((initial || !asset_exists ? '' : 're')
            + `loaded static/${asset_name}, size ${stat.size}, mtime ${format_log_time(stat.mtime)}`);
    }
};

fs.readdirSync(static_directory)
    .filter(asset_name => asset_name[0] != '.' && static_asset_extensions.some(ext => asset_name.endsWith(ext)))
    .map(asset_name => load_static_asset(asset_name, true));
const static_asset_watcher = fs.watch(static_directory, (event_type, maybe_asset_name) => {

    // ignore hidden files
    if (maybe_asset_name[0] == '.'
        || static_asset_extensions.every(ext => !maybe_asset_name.endsWith(ext))) return;

    const asset_path = path.join(static_directory, maybe_asset_name);
    if (event_type == 'rename') {
        if (fs.existsSync(asset_path)) {  // new file
            load_static_asset(maybe_asset_name, false);
        } else {                        // remove file
            if (path.extname(maybe_asset_name) == '.html') {
                const app_name = path.basename(maybe_asset_name, '.html');
                if (app_name in static_app_contents) {
                    logger.log(`unload static/${maybe_asset_name}`);
                    delete static_app_contents[path.basename(maybe_asset_name, '.html')];
                }
            } else {
                if (maybe_asset_name in static_file_contents) {
                    logger.log(`unload static/${maybe_asset_name}`);
                    delete static_file_contents[maybe_asset_name];
                }
            }
        }
    } else if (event_type == 'change') { // change file
        if (fs.existsSync(asset_path)) {  // change event file may not exist, don't ask me why
            load_static_asset(maybe_asset_name, false);
        }
    }
});

app.get('/app/:appname', (request, response) => {
    const app_name = request.params.appname as string;
    if (app_name in static_app_contents) {
        response
            .header('Content-Type', 'text/html')
            .send(static_app_contents[app_name].content);
    } else {
        redirect_404(request, response);
    }
});

app.get('/static/:filename', (request, response) => {
    const file_name = request.params.filename as string;
    if (file_name in static_file_contents) {
        response.send(static_file_contents[file_name].content);
    } else {
        redirect_404(request, response);
    }
});

// chrome seems to only loads /favicon.ico although I write /static/favicon.ico
app.get('/favicon.ico', (_request, response) => response.send(static_file_contents['favicon.ico'].content));

// api controllers
app.use('/api/sehu', SehuController);

// default to 404
app.use((request, response, _next) => {
    if (request.accepts('html')) {
        redirect_404(request, response);
    }
});

process.on('SIGINT', () => {
    logger.log('received SIGINT, closing server');
    server.close();
    logger.log('received SIGINT, closing watchers');
    static_asset_watcher.close();
});

logger.log(`starting server on port ${port}`)
let server = app.listen(port);

