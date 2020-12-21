import * as net from 'net';
import { Mutex } from 'async-mutex';
import { AdminPayload } from '../../src/shared/types/admin';
import { logInfo, logError } from '../common';

async function impl(payload: AdminPayload): Promise<void> {
    const socket = net.createConnection('/tmp/fps.socket').ref();

    return new Promise((resolve, reject) => {
        const serialized = JSON.stringify(payload);

        socket.on('error', error => {
            if ('code' in error && (error as any).code == 'ENOENT') {
                logError('adm', `admin socket not open, command ${serialized} discarded`);
                resolve();
            } else {
                logError('adm', `socket error: ${error.message}`);
                reject(); // close is auto called after this event
            }
        });
        socket.on('timeout', () => {
            logError('adm', `socket timeout`);
            socket.destroy(); // close is not auto called after this event
            reject();
        });
        socket.once('data', data => {
            if (data.toString('utf-8') == 'ACK') {
                logInfo('adm', `command ${serialized} acknowledged`);
                setTimeout(() => {
                    socket.destroy();
                    resolve();
                }, 0);
            }
        });
        socket.write(serialized);
    });
}

const mutex = new Mutex();
export async function admin(payload: AdminPayload) {
    await mutex.runExclusive(async () => await impl(payload));
}
