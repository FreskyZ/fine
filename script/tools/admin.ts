import * as net from 'net';
import { Mutex } from 'async-mutex';
import * as chalk from 'chalk';
import { AdminPayload } from '../../src/shared/types/admin';
import { logInfo, logError } from '../common';

function formatPayload(payload: AdminPayload) {
    switch (payload.type) {
        case 'shutdown': return 'shutdown';
        case 'reload-static': return `reload-static ${payload.key}`;
        case 'reload-server': return `reload-server ${payload.app}`;
        case 'expire-device': return `expire-device ${payload.deviceId}`;
        case 'config-devmod': return `config-devmod ${payload.sourceMap} ${payload.websocketPort}`;
    }
}

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
                // strange method to shorten message by extract `type` part
                logInfo('adm', chalk`ACK {blue ${formatPayload(payload)}}`);
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
export async function admin(payload: AdminPayload) {
    await mutex.runExclusive(async () => await impl(payload));
}
