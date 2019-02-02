import fs from 'fs';
import path from 'path';
import express from 'express';
import SehuController from './sehu';

let app = express();

// html files (one for each app) and other static files
const static_directory = path.join(__dirname, '../../static');
const other_static_files: { [name: string]: string } = {};
for (const filename of fs.readdirSync(static_directory)) {
    if (path.extname(filename) == '.html') {
        const route_name = filename == 'index.html' ? '' : path.basename(filename, '.html');
        const fullpath = path.join(static_directory, filename);
        app.get('/' + route_name, (_, response) => response.sendFile(fullpath));
    } else {
        other_static_files[filename] = path.join(static_directory, filename);
    }
}
app.get('/static/*', (request, response) => {
    const request_file = path.basename(request.url);
    const request_path = other_static_files[request_file];
    if (request_path) {
        response.sendFile(request_path);
    } else {
        response.redirect('/404');
    }
});

// api controllers
app.use('/api/sehu', SehuController);

// 404
app.use((request, response, _next) => {
    if (request.accepts('html')) {
        response.redirect('/404');
    }
});

process.on('SIGINT', () => {
    console.log('INFO: received SIGINT, exiting, waiting for server closing');
    server.close();
});

console.log('INFO: starting server on port 80')
let server = app.listen(80);

