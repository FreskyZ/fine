import * as net from 'net';
import { Mutex } from 'async-mutex';
import { AdminSocketPayload } from '../src/shared/types/admin';

async function impl(payload: AdminSocketPayload): Promise<void> {
    const socket = net.createConnection('/tmp/fps.socket').ref();

    return new Promise((resolve, reject) => {
        const serialized = JSON.stringify(payload);

        socket.on('error', error => {
            if ('code' in error && (error as any).code == 'ENOENT') {
                console.log(`[adm] admin socket not open, command ${serialized} discarded`);
                resolve();
            } else {
                console.log(`[adm] socket error: ${error.message}`);
                reject(); // close is auto called after this event
            }
        });
        socket.on('timeout', () => {
            console.log(`[adm] socket timeout`);
            socket.destroy(); // close is not auto called after this event
            reject();
        });
        socket.once('data', data => {
            if (data.toString('utf-8') == 'ACK') {
                console.log(`[adm] command ${serialized} acknowledged`);
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
export async function admin(payload: AdminSocketPayload) {
    await mutex.runExclusive(async () => await impl(payload));
}
