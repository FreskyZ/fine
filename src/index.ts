import fs from 'fs';
import path from 'path';
import express from 'express';
import ShanghaiBusInfoController from './api/sh-bus-controller';

const STATIC_DIRECTORY = path.join(__dirname, '../static');
const HTML_FILES = fs.readdirSync(STATIC_DIRECTORY)
    .filter(filename => path.extname(filename) == '.html')
    .map(filename => ({
        name: filename == 'index.html' ? '' : path.basename(filename, '.html'),
        path: path.join(STATIC_DIRECTORY, filename),
    }));
const HTML404 = `<html>
    <head><title>404!</title></head>
    <body>404!</body>
</html>`;

let app = express();

for (const html_file of HTML_FILES) {
    app.get('/' + html_file.name, (_request, response) => {
        response.sendFile(html_file.path);
    });
}

app.use('/api/sh-bus', ShanghaiBusInfoController);
app.use((request, response, _next) => { if (request.accepts('html')) response.send(HTML404); });

process.on('SIGINT', () => {
    console.log('INFO: received SIGINT, exiting, waiting for server closing');
    server.close();
});

console.log('INFO: starting server on port 80')
let server = app.listen(80);

