import * as fs from 'fs';
import type * as http from 'http';
import * as https from 'https';
import * as net from 'net';
import { Mutex } from 'async-mutex';
import * as chalk from 'chalk';
import * as WebSocket from 'ws';
import { AdminPayload } from '../src/shared/types/admin';
import { logInfo, logError, formatAdminPayload } from './common';

// akari (server) entry
// log headers: uxs: unix socket, wbs: websocket, htt: https server

const httpsServer = https.createServer({ key: fs.readFileSync('SSL_KEY'), cert: fs.readFileSync('SSL_FULLCHAIN') }, handleCommand);
const wsServer = new WebSocket.Server({ server: httpsServer });

const mutex = new Mutex();
async function sendToServerCore(payload: AdminPayload): Promise<boolean> {
    logInfo('uxs', chalk`forward {blue ${formatAdminPayload(payload)}}`);
    return await mutex.runExclusive(async () => await impl(payload));

    async function impl(payload: AdminPayload): Promise<boolean> {
        const socket = net.createConnection('/tmp/fps.socket');
    
        return new Promise<boolean>(resolve => {
            const serialized = JSON.stringify(payload);
    
            socket.on('error', error => {
                if ('code' in error && (error as any).code == 'ENOENT') {
                    if (payload.type != 'ping') {
                        logError('uxs', `socket not open, discard ${formatAdminPayload(payload)}`);
                    }
                    resolve(false);
                } else {
                    logError('uxs', `socket error: ${error.message}`);
                    resolve(false); // close is auto called after this event
                }
            });
            socket.on('timeout', () => {
                logError('uxs', `socket timeout`);
                socket.destroy(); // close is not auto called after this event
                resolve(false);
            });
            socket.once('data', data => {
                if (data.toString('utf-8') == 'ACK') {
                    // strange method to shorten message by extract `type` part
                    logInfo('uxs', chalk`acknowledge {blue ${formatAdminPayload(payload)}}`);
                    setImmediate(() => {
                        socket.destroy();
                        resolve(true);
                    });
                }
            });
            socket.write(serialized);
        });
    }
}

async function sendToWebPage(command: string): Promise<boolean> {
    logInfo('wbs', chalk`forward {blue ${command}}`);
    const clients = Array.from(wsServer.clients).filter(c => c.readyState == WebSocket.OPEN);
    if (clients.length == 0) {
        logInfo('wbs', chalk`{gray no client}`);
        return true;
    }

    // for one client, send callback error is fail, unknown response is fail
    // for all client, any success is success, not any success is fail
    return Promise.all(clients.map(client => new Promise<boolean>(resolve => {
        let timeout: NodeJS.Timeout;
        const handleMessage = (message: string) => {
            if (message.startsWith('ACK ')) {
                resolve(true);
            } else {
                logError('wbs', chalk`{gray unknown response ${message}}`);
                resolve(false);
            }
            clearTimeout(timeout);
            client.off('message', handleMessage);
        }
        client.once('message', handleMessage);
        timeout = setTimeout(() => {
            logError('wbs', 'timeout');
            resolve(false); // this resolve(false) will make furthur resolve(true) noop
            client.off('message', handleMessage);
        }, 12_000);

        client.send(command, error => {
            if (error) {
                logError('wbs', `send error ${error.message}`, error);
                clearTimeout(timeout);
                resolve(false);
            }
        });
    }))).then(results => {
        if (results.some(r => r)) {
            logInfo('wbs', chalk`acknowledge (webpages ${results.filter(r => r).length}/${results.length}) {blue ${command}}`);
            return true;
        } else {
            logError('wbs', `broadcast no success (0/${results.length})`);
            return false;
        }
    }, ex => {
        logError('wbs', `unexpected broadcast error`, ex);
        return false;
    });
}

function handleCommand(request: http.IncomingMessage, response: http.ServerResponse) {
    let fulldata = ''; // I don't know when this small request will be splitted, but collect full data in case
    request.on('data', data => { fulldata += Buffer.isBuffer(data) ? data.toString() : data; });
    request.on('end', () => {
        let payload: AdminPayload;
        try {
            payload = JSON.parse(fulldata) as AdminPayload;
        } catch {
            response.statusCode = 400;
            response.end();
            return;
        }

        (payload.type == 'webpage' ? sendToWebPage(payload.data.type) : sendToServerCore(payload)).then(result => {
            if (result) {
                response.write('ACK ' + fulldata);
                response.statusCode = 200;
            } else {
                response.statusCode = 400;
            }
            response.end()
        });
    });
}

const httpsConnections: { [key: string]: net.Socket } = {};
httpsServer.on('connection', (socket: net.Socket) => {
    const key = `${socket.remoteAddress}:${socket.remotePort}`;
    // logInfo('htt', `https connected from ${key}`);
    httpsConnections[key] = socket;
    socket.on('error', (error: any) => {
        // see src/server-core/index.ts
        if (error.code == 'ECONNRESET' && error.syscall == 'read') {
            // ignore
        } else if (error.code == 'HPE_INVALID_METHOD') {
            // ignore
        }
        logError('htt', `https socket error ${error.message}`, error);
    });
    socket.on('close', () => {
        // logInfo('htt', `https disconntected from ${key}`);
        delete httpsConnections[key];
    });
});

wsServer.on('connection', connection => {
    // these clients already stored in wsServer
    // const key = `${socket.remoteAddress}:${socket.remotePort}`;
    // logInfo('wbs', `websocket connected from ${clientAddress}`);
    connection.on('error', error => {
        logError('wbs', `socket error ${error.message}`, error);
    });
    connection.on('close', () => {
        // logInfo('wbs', `websocket disconnected from ${clientAddress}`);
    });
});
wsServer.on('error', error => {
    logError('wbs', `server error ${error.message}`, error);
});

function startup() {
    const handleListenError = (error: Error) => { 
        logError('htt', `server startup error: ${error.message}`);
        logError('akr', 'akari startup failed');
        process.exit(101);
    };
    httpsServer.once('error', handleListenError); 
    httpsServer.listen(8001, () => {
        httpsServer.removeListener('error', handleListenError);
        httpsServer.on('error', error => {
            // currently this is never reached
            logError('htt', 'server error: ' + error.message);
        });
        logInfo('akr', 'akari startup');
    });
}

let shuttingdown = false;
function shutdown() {
    if (shuttingdown) return; 
    shuttingdown = true;

    // destroy connections
    for (const client of wsServer.clients) {
        client.close();
    }
    for (const key in httpsConnections) {
        httpsConnections[key].destroy();
    }

    // wait all server close
    Promise.all([
        new Promise<void>((resolve, reject) => wsServer.close(error => { 
            if (error) { logError('wbs', `close server error: ${error.message}`); reject(); } 
            else { resolve(); }
        })),
        new Promise<void>((resolve, reject) => httpsServer.close(error => { 
            if (error) { logError('htt', `close server error: ${error.message}`); reject(); } 
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
startup();
