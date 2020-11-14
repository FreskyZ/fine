import * as net from 'net';
import { AdminSocketPayload } from '../src/shared/types/admin';

let contacting = false; // prevent reentry
async function impl(payload: AdminSocketPayload): Promise<void> {
    contacting = true;
    const socket = net.createConnection('/tmp/fps.socket').unref();

    return new Promise((resolve, reject) => {
        const serialized = JSON.stringify(payload);

        socket.on('error', error => {
            console.log(`[adm] socket error: ${error.message}`);
            reject(); // close is auto called after this event
        });
        socket.on('timeout', () => {
            console.log(`[adm] socket timeout`);
            socket.destroy(); // close is not auto called after this event
            reject();
        });
        socket.once('data', data => {
            if (data.toString('utf-8') == 'ACK') {
                console.log(`[adm] command ${serialized} acknowledged`);
                socket.destroy();
                resolve();
                contacting = false;
            }
        });
        socket.write(serialized);
    });
}

export async function send(data: AdminSocketPayload): Promise<void> {
    // spin wait reentry
    if (contacting) {
        setTimeout(send, 1000, data);
    } else {
        impl(data);
    }
}
