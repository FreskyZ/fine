var express = require('express');
var fs = require('fs');

var app = express();

app.get('/', (request, response) => {
    console.log('INFO: ' + new Date());
    console.log('INFO: get request: ' + request.method + ' ' + request.originalUrl);
    console.log('INFO: cookie: ' + request.cookie);
    console.log('INFO: ip: ' + request.ip);

    fs.readFile('src/index.html', 'utf-8', (err, data) => {
        if (err) {
            response.statusCode = 500;
            response.send('failed to read index.html');
        }
        response.send(data);
    });
});

process.on('SIGINT', () => {
    console.log('INFO: received SIGINT, exiting, waiting for server closing');
    server.close();
});

console.log('INFO: starting server on port 80')
var server = app.listen(80);

