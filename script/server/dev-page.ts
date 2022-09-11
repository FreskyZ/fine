import type * as http from 'http';
import * as chalk from 'chalk';
import * as WebSocket from 'ws';
import { AdminDevPageCommand } from '../../src/shared/types/admin';
import { logInfo, logError } from '../common';

// handle GET /client-dev.js for (app) watch client
// handle send command to dev page
// wbs: websocket

const clientdevjs =
`const ws=new WebSocket(\`wss://\${location.host}:PORT\`);` +
`ws.onmessage=e=>{` +
    `ws.send('ACK '+e.data);` +
    `if(e.data==='reload-js'){` +
        `location.reload();` +
    `}else if(e.data==='reload-css') {` +
        `const oldlink=Array.from(document.getElementsByTagName('link')).find(e=>e.getAttribute('href')==='/index.css');` +
        `const newlink=document.createElement('link');` +
        `newlink.setAttribute('rel','stylesheet');newlink.setAttribute('type','text/css');newlink.setAttribute('href','/index.css');` +
        `document.head.appendChild(newlink);` +
        `oldlink?.remove();` +
    `}` +
`};`;

// return true for handled
export function handleDevScriptRequest(port: number, request: http.IncomingMessage, response: http.ServerResponse): boolean {
    if (request.method == 'GET' && request.url == '/client-dev.js') {
        logInfo('htt', 'GET /client-dev.js');
        response.statusCode = 200;
        response.write(clientdevjs.replace('PORT', port.toString()));
        response.end();
        return true;
    } else {
        return false;
    }
}

async function send(clients: Iterable<WebSocket>, command: AdminDevPageCommand): Promise<boolean> {
    logInfo('wbs', chalk`forward {blue ${command}}`);

    const activeClients = Array.from(clients).filter(c => c.readyState == WebSocket.OPEN);
    if (activeClients.length == 0) {
        logInfo('wbs', chalk`{gray no active client}`);
        return Promise.resolve(true);
    }

    // for one client, send callback error is fail, unknown response is fail
    // for all client, any success is success, not any success is fail
    return await Promise.all(activeClients.map(client => new Promise<boolean>(resolve => {
        const handleMessage = (message: string) => {
            if (message.startsWith('ACK ')) {
                resolve(true);
            } else {
                logError('wbs', chalk`{gray unknown response ${message}}`);
                resolve(false);
            }
            clearTimeout(timeout);
            client.off('message', handleMessage);
        };
        client.once('message', handleMessage);
        const timeout = setTimeout(() => {
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
            logInfo('wbs', chalk`ack (pages ${results.filter(r => r).length}/${results.length}) {blue ${command}}`);
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

export function handleDevPageCommand(clients: Iterable<WebSocket>, command: AdminDevPageCommand, response: http.ServerResponse, rawPayload: string): void {
    send(clients, command).then(result => {
        if (result) {
            response.write('ACK ' + rawPayload);
            response.statusCode = 200;
        } else {
            response.statusCode = 400;
        }
        response.end();
    });
}
