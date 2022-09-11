import type * as http from 'http';
import * as net from 'net';
import { Mutex } from 'async-mutex';
import * as chalk from 'chalk';
import type { AdminCoreCommand } from '../../src/shared/types/admin';
import { logInfo, logError, formatAdminCoreCommand } from '../common';

// to server-core admin socket
// uxs: unix socket

const mutex = new Mutex();
async function sendimpl(command: AdminCoreCommand, internal: boolean): Promise<boolean> {
    const displayCommand = formatAdminCoreCommand(command);
    // internal commands does not print 'forward command' message
    if (!internal) { logInfo('uxs', chalk`forward {blue ${displayCommand}}`); }
    return await mutex.runExclusive(async () => await impl());

    function impl(): Promise<boolean> {
        const socket = net.createConnection('/tmp/fine.socket');
        return new Promise<boolean>(resolve => {
            const serialized = JSON.stringify(command);
            socket.on('error', error => {
                if ('code' in error && (error as any).code == 'ENOENT') {
                    if (command.type != 'ping') { logError('uxs', chalk`discard {blue ${displayCommand}}`); }
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
                    logInfo('uxs', chalk`ack (server-core) {blue ${displayCommand}}`);
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

export function sendCoreCommand(command: AdminCoreCommand): Promise<boolean> {
    return sendimpl(command, true);
}
export function handleCoreCommand(command: AdminCoreCommand, response: http.ServerResponse, rawPayload: string): void {
    sendimpl(command, false).then(result => {
        if (result) {
            response.write('ACK ' + rawPayload);
            response.statusCode = 200;
        } else {
            response.statusCode = 400;
        }
        response.end();
    });
}

