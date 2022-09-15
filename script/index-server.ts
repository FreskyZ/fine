
import * as fs from 'fs';
import type * as http from 'http';
import * as https from 'https';
import * as net from 'net';
import * as WebSocket from 'ws';
import { logInfo, logError } from './common';
import { port, decrypt, initializeSecurity } from './server/security';
import { sendCoreCommand, handleCoreCommand } from './server/core';
import { handleDevScriptRequest, handleDevPageCommand } from './server/dev-page';
import { handleServiceCommand, handleSelfHostCommand, stopSelfHost } from './server/host';

// akari (server) entry, see docs/build-script.md

const config = JSON.parse(fs.readFileSync('config', 'utf-8'));
initializeSecurity(config['codebook']);

const httpsServer = https.createServer({ key: fs.readFileSync(config['ssl']['key']), cert: fs.readFileSync(config['ssl']['fullchain']) }, handleCommand);
const wsServer = new WebSocket.Server({ server: httpsServer });

function handleCommand(request: http.IncomingMessage, response: http.ServerResponse) {
    if (handleDevScriptRequest(port, request, response)) { return; } // only this one do not require encrypted command

    let requestBody = ''; // I don't know when this small request will be splitted, but collect full data in case
    request.on('data', data => { requestBody += Buffer.isBuffer(data) ? data.toString() : data; });
    request.on('end', () => {
        const [rawPayload, payload] = decrypt(requestBody, response);
        if (!payload) { return; }

        switch (payload.target) {
            case 'core': return handleCoreCommand(payload.data, response, rawPayload);
            case 'dev-page': return handleDevPageCommand(wsServer.clients, payload.data, response, rawPayload);
            case 'service': return handleServiceCommand(payload.data, response);
            case 'self-host': return handleSelfHostCommand(payload.data, response);
        }
    });
}

const httpsConnections: { [key: string]: net.Socket } = {};
httpsServer.on('connection', (socket: net.Socket) => {
    resetShutdownTimeout();

    const key = `${socket.remoteAddress}:${socket.remotePort}`;
    // logInfo('htt', `https connected from ${key}`);
    httpsConnections[key] = socket;
    socket.on('error', (error: any) => {
        // see src/core/index.ts
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
    resetShutdownTimeout();
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

let shutdownTimeout: NodeJS.Timeout;
function resetShutdownTimeout() {
    if (shutdownTimeout) {
        clearTimeout(shutdownTimeout);
    }
    shutdownTimeout = setTimeout(shutdown, 7200_000);
}

function startup() {
    Promise.all([
        new Promise<void>((resolve) => {
            // reserved
            resolve();
        }),
        new Promise<void>((resolve, reject) => {
            const handleListenError = (error: Error) => {
                logError('htt', `server startup error: ${error.message}`);
                reject();
            };
            httpsServer.once('error', handleListenError);
            httpsServer.listen(port, () => {
                httpsServer.removeListener('error', handleListenError);
                httpsServer.on('error', error => {
                    // currently this is never reached
                    logError('htt', 'server error: ' + error.message);
                });
                resolve();
            });
        }),
    ]).then(() => {
        logInfo('akr', 'akari startup');
    }, () => {
        logError('akr', 'akari startup failed');
        process.exit(101);
    });

    resetShutdownTimeout();
    sendCoreCommand({ type: 'content', sub: { type: 'enable-source-map' } }); // send and ignore
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

    try { fs.unlinkSync('akariv'); } catch { /* ignore */ }

    stopSelfHost();

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
