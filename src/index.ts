import express from 'express';
import fs from 'fs';
import { STATIC_FILES } from './config';
import ShanghaiBusInfoController from './api/sh-bus-controller';

let app = express();

for (const static_file of STATIC_FILES) {
    app.get('/' + static_file.route, (_request, response) => {
        fs.readFile('build/static/' + static_file.filename, 'utf-8', (err, data) => {
            if (err) {
                response.statusCode = 404;
                response.send('<html><head><title>~/404</title></head><body>404!</body></html>');
                console.log('read static file failed: ' + err);
            } else {
                response.send(data);
            }
        });
    });
}

app.use('/api/sh-bus', ShanghaiBusInfoController);

process.on('SIGINT', () => {
    console.log('INFO: received SIGINT, exiting, waiting for server closing');
    server.close();
});

console.log('INFO: starting server on port 80')
let server = app.listen(80);

