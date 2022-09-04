import type * as http from 'http';
import * as chalk from 'chalk';
import * as WebSocket from 'ws';
import { AdminWebPageCommand } from '../../src/shared/types/admin';
import { logInfo, logError } from '../common';

// to web page websocket
// wbs: websocket

async function send(clients: Iterable<WebSocket>, command: AdminWebPageCommand): Promise<boolean> {
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

export function handle(clients: Iterable<WebSocket>, command: AdminWebPageCommand, response: http.ServerResponse, rawPayload: string): void {
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
