import * as https from 'https';
import * as net from 'net';
import * as chalk from 'chalk';
import * as WebSocket from 'ws';
import { logInfo, logError } from '../common';

// websocket server to indicate client to refresh

const httpServer = https.createServer({ /*key: fs.readFileSync('SSL_KEY'), cert: fs.readFileSync('SSL_CERT')*/ });

const httpConnections: { [key: string]: net.Socket } = {};
httpServer.on('connection', socket => {
    const key = `https:${socket.remoteAddress}:${socket.remotePort}`;
    httpConnections[key] = socket;
    socket.on('close', () => delete httpConnections[key]);
});

const wsServer = new WebSocket.Server({ server: httpServer });

let errored = false;
let started = false;

wsServer.on('error', error => {
    errored = true;
    logError('wsa', `server error ${error.message}\n${JSON.stringify(error)}`);
});
wsServer.on('connection', (connection, request) => {
    const clientAddress = request.socket.remoteAddress;
    // logInfo('wsa', `connection from ${clientAddress} setup`);
    connection.on('error', error => {
        logError('wsa', `connection from ${clientAddress} error ${error.message}\n${JSON.stringify(error)}`);
    });
    connection.on('close', () => {
        // logInfo('wsa', `connection from ${clientAddress} close`);
    });
    connection.on('message', (message: string) => {
        if (message.startsWith('ACK ')) {
            logInfo('wsa', chalk`ACK {blue ${message.slice(4)}}`);
        } else {
            logInfo('wsa', chalk`{gray unexpected message ${message}}`);
        }
    });
});

process.on('exit', () => {
    if (started) {
        for (const connection of wsServer.clients) {
            connection.close();
        }
        for (const connectionKey in httpConnections) {
            httpConnections[connectionKey].destroy();
        }
        wsServer.close();
        httpServer.close();
    }
});

export function wswatch(port: number) {
    httpServer.listen(port, () => { started = true; logInfo('wsa', chalk`watch {yellow :${port}}`) });
}

export function wsadmin(command: string) {
    if (!started || errored) { return; }

    const clients = Array.from(wsServer.clients).filter(c => c.readyState == WebSocket.OPEN);
    if (clients.length == 0) {
        logInfo('wsa', chalk`{gray no client}`);
        return;
    }
    for (const client of clients) {
        client.send(command, (error) => {
            if (error) {
                logError('wsa', `send error ${error.message}\n${JSON.stringify(error)}`);
            }
        });
    }
}
