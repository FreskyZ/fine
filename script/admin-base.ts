import * as net from 'net';
import { AdminSocketPayload } from '../src/shared/types/admin';

let connection: net.Socket = null;
async function initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
        connection = net.createConnection('/tmp/fps.socket');
        connection.unref();

        connection.on('error', error => {
            console.log(`[adm] connection error: ${error.message}`);
            reject(); // and unhandled rejection will terminate process
        });
        connection.on('connect', () => {
            resolve();
        });
        connection.on('close', () => {
            connection = null;
        });
    })
}

export async function sendAdminMessage(payload: AdminSocketPayload) {
    if (connection == null) {
        await initialize();
    }
    return new Promise((resolve, reject) => {
        connection.once('data', (data) => {
            if (data.toString('utf-8') == 'ACK') { // ignore 2 near packages for now
                resolve();
            }
        });
        connection.once('timeout', () => {
            reject('timeout');
        });
        connection.write(JSON.stringify(payload));
    });
}

process.on('exit', () => {
    if (connection) {
        connection.destroy();
    }
});
process.on('SIGINT', () => {
    if (connection) {
        connection.destroy();
    }
});
