import * as fs from 'fs';
import type * as http from 'http';
import * as https from 'https';
import * as net from 'net';
import * as chalk from 'chalk';
import * as WebSocket from 'ws';
import { logInfo, logError, formatAdminPayload } from './common';

function handleCommand(request: http.IncomingMessage, response: http.ServerResponse) {
    let fulldata = ''; // I don't know when this small request will be splitted, but collect full data in case
    request.on('data', data => { fulldata += Buffer.isBuffer(data) ? data.toString() : data; });
    request.on('end', () => {
        try {
            const payload = JSON.parse(fulldata);
            logInfo('akr', chalk`forward {yellow ${formatAdminPayload(payload)}}`);
            response.write('ACK ' + fulldata);
            response.statusCode = 200;
            response.end();
        } catch {
            response.statusCode = 400;
            response.end();
        }
    });
}

const httpsServer = https.createServer({ 
    key: fs.readFileSync('SSL_KEY'), 
    cert: fs.readFileSync('SSL_FULLCHAIN'),
}, handleCommand);

const httpsConnections: { [key: string]: net.Socket } = {};
httpsServer.on('connection', (socket: net.Socket) => {
    const key = `${socket.remoteAddress}:${socket.remotePort}`;
    // logInfo('akr', `https connected from ${key}`);
    httpsConnections[key] = socket;
    socket.on('error', (error: any) => {
        // see src/server-core/index.ts
        if (error.code == 'ECONNRESET' && error.syscall == 'read') {
            // ignore
        } else if (error.code == 'HPE_INVALID_METHOD') {
            // ignore
        }
        logError('akr', `https socket error ${error.message}`, error);
    });
    socket.on('close', () => {
        // logInfo('akr', `https disconntected from ${key}`);
        delete httpsConnections[key]
    });
});

const wsServer = new WebSocket.Server({ server: httpsServer });

wsServer.on('connection', connection => {
    // these clients already stored in wsServer
    // const key = `${socket.remoteAddress}:${socket.remotePort}`;
    // logInfo('akr', `websocket connected from ${clientAddress}`);
    connection.on('error', error => {
        logError('akr', `websocket socket error ${error.message}`, error);
    });
    connection.on('close', () => {
        // logInfo('akr', `websocket disconnected from ${clientAddress}`);
    });
    connection.on('message', (message: string) => {
        if (message.startsWith('ACK ')) {
            logInfo('akr', chalk`ACK {cyan ${message.slice(4)}}`);
        } else {
            logInfo('akr', chalk`{gray unknown message ${message}}`);
        }
    });
});

// wsServer.on('error', error => {
//     errored = true;
//     logError('wsa', `server error ${error.message}\n${JSON.stringify(error)}`);
// });


Promise.all([
    new Promise<void>((resolve, reject) => {
        const handleListenError = (error: Error) => { 
            logError('akr', `http server startup error: ${error.message}`); 
            reject(); 
        };
        httpsServer.once('error', handleListenError); 
        httpsServer.listen(8001, () => {
            httpsServer.removeListener('error', handleListenError);
            httpsServer.on('error', error => {
                // // currently this is never reached
                logError('akr', 'http server error: ' + error.message);
            });
            resolve();
        });
    }),
]).then(() => {
    logInfo('akr', 'akari startup');
}).catch(() => {
    logError('akr', 'akari startup failed');
    process.exit(101);
});

let shuttingdown = false;
function shutdown() {
    if (shuttingdown) return; 
    shuttingdown = true;

    // destroy connections
    for (const key in httpsConnections) {
        httpsConnections[key].destroy();
    }

    // wait all server close
    Promise.all([
        new Promise<void>((resolve, reject) => httpsServer.close(error => { 
            if (error) { logError('akr', `close http server error: ${error.message}`); reject(); } 
            else { resolve(); }
        })),
    ]).then(() => {
        logInfo('akr', 'akari shutdown');
        process.exit(0);
    }, () => {
        logError('akr', 'akari shutdown with error');
        process.exit(102);
    });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);


// process.on('exit', () => {
//     if (started) {
//         for (const connection of wsServer.clients) {
//             connection.close();
//         }
//         for (const connectionKey in httpConnections) {
//             httpConnections[connectionKey].destroy();
//         }
//         wsServer.close();
//         httpServer.close();
//     }
// // });

// export function wswatch(port: number) {
//     httpServer.listen(port, () => { started = true; logInfo('wsa', chalk`watch {yellow :${port}}`) });
// }

// export function wsadmin(command: string) {
//     if (!started || errored) { return; }

//     const clients = Array.from(wsServer.clients).filter(c => c.readyState == WebSocket.OPEN);
//     if (clients.length == 0) {
//         logInfo('wsa', chalk`{gray no client}`);
//         return;
//     }
//     for (const client of clients) {
//         client.send(command, (error) => {
//             if (error) {
//                 logError('wsa', `send error ${error.message}\n${JSON.stringify(error)}`);
//             }
//         });
//     }
// }
