import * as cp from 'child_process';
import type * as http from 'http';
import { AdminServiceHostCommand } from '../../src/shared/types/admin';
import { logInfo, logError } from '../common';

// call systemctl
// svc: service

export function handle(command: AdminServiceHostCommand, response: http.ServerResponse): void {
    response.statusCode = 200;
    logInfo('svc', `systemctl ${command}`);
    const systemctlProcess = cp.spawn('systemctl', [command, 'fine']);
    systemctlProcess.stdout.pipe(response, { end: false });
    systemctlProcess.stderr.pipe(response, { end: false });
    systemctlProcess.on('error', error => {
        logError('svc', `process error ${error.message}`, error);
    });
    systemctlProcess.on('exit', code => {
        response.write(`systemctl exit with ${code}\n`);
        response.end();
    });
}
