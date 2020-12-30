import * as net from 'net';
import { Mutex } from 'async-mutex';
import * as chalk from 'chalk';
import { AdminPayload } from '../../src/shared/types/admin';
import { logInfo, logError, formatAdminPayload } from '../common';

// this is akari (server) to server-core

async function impl(payload: AdminPayload): Promise<void> {
    const socket = net.createConnection('/tmp/fps.socket');

    return new Promise((resolve, reject) => {
        const serialized = JSON.stringify(payload);

        socket.on('error', error => {
            if ('code' in error && (error as any).code == 'ENOENT') {
                if (payload.type != 'ping') {
                    logError('uxs', `socket not open, discard ${formatAdminPayload(payload)}`);
                }
                reject();
            } else {
                logError('uxs', `socket error: ${error.message}`);
                reject(); // close is auto called after this event
            }
        });
        socket.on('timeout', () => {
            logError('uxs', `socket timeout`);
            socket.destroy(); // close is not auto called after this event
            reject();
        });
        socket.once('data', data => {
            if (data.toString('utf-8') == 'ACK') {
                // strange method to shorten message by extract `type` part
                logInfo('uxs', chalk`ACK {blue ${formatAdminPayload(payload)}}`);
                setImmediate(() => {
                    socket.destroy();
                    resolve();
                });
            }
        });
        socket.write(serialized);
    });
}

const mutex = new Mutex();
export async function send(payload: AdminPayload) {
    await mutex.runExclusive(async () => await impl(payload));
}
