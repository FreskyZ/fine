import * as cp from 'child_process';
import type * as stream from 'stream';
import type * as http from 'http';
import * as chalk from 'chalk';
import * as dayjs from 'dayjs';
import type { AdminSelfHostCommand, AdminServiceCommand } from '../../src/shared/admin';
import { logInfo, logError } from '../common';
import { sendCoreCommand } from './core';

// manage core process status and lifetime, by invoking systemctl or host by self (akari (server))
// svc: service, seh: self host

export function handleServiceCommand(command: AdminServiceCommand, response: http.ServerResponse): void {
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


function writeInfo(writable: stream.Writable, header: string, message: string) {
    writable.write(chalk`[{green ${dayjs().format('HH:mm:ss.SSS')}} {gray ${header}}] ${message}\n`);
}
function writeError(writable: stream.Writable, header: string, message: string) {
    writable.write(chalk`[{green ${dayjs().format('HH:mm:ss.SSS')}} {red ${header}}] ${message}\n`);
}

let corehost: CoreHost | null = null;

class CoreHost {
    private theProcess: cp.ChildProcessWithoutNullStreams | null = null;
    public constructor(private readonly response: http.ServerResponse) {
        this.startimpl();
    }

    private startimpl() {
        logInfo('seh', 'start core process');
        writeInfo(this.response, 'akr(server)', 'start core process');
        this.theProcess = cp.spawn(process.argv0, ['index.js'], { env: { FINE_TRACE: '1' } }); // node is inside nvm, use argv0 is simpler
        this.theProcess.stdout.pipe(this.response, { end: false });
        this.theProcess.stderr.pipe(this.response, { end: false });
        this.theProcess.on('error', error => {
            // document says this happens when process failed to spawn, failed to exit or failed to send message
            // I do not use the send message feature and do not exit by theProcess.kill() so this should only be happen when failed to spawn
            // in that case, theProcess reference should also be discard
            writeError(this.response, 'akr(server)', `core process error ${error.message}`);
            logError('seh', `process error ${error.message}`, error);
            this.theProcess = null;
        });
        this.theProcess.on('exit', code => {
            (code == 0 ? writeInfo : writeError)(this.response, 'akr(server)', `core process exit with code ${code}`);
            (code == 0 ? logInfo : logError)('seh', `core process exit with code ${code}`);
            this.theProcess = null;
        });
        this.theProcess.unref();
    }
    public start() {
        if (this.theProcess != null) {
            this.theProcess.once('exit', this.startimpl.bind(this));
            sendCoreCommand({ type: 'shutdown' }).then(result => {
                if (result) {
                    writeInfo(this.response, 'akr(server)', chalk`ack {yellow shutdown} (1)`);
                } else {
                    writeError(this.response, 'akr(server)', chalk`fail {yellow shutdown} (1)`);
                }
            });
        } else {
            this.startimpl();
        }
    }
    public stop() {
        sendCoreCommand({ type: 'shutdown' }).then(result => {
            if (result) {
                writeInfo(this.response, 'akr(server)', chalk`ack {yellow shutdown} (2)`);
            } else {
                writeError(this.response, 'akr(server)', chalk`fail {yellow shutdown} (2)`);
            }
            this.response.end();
        });
    }
}

export function stopSelfHost(): void { 
    if (corehost) {
        corehost.stop();
    }
}

export function handleSelfHostCommand(command: AdminSelfHostCommand, response: http.ServerResponse): void {
    response.statusCode = 200;
    if (command == 'start') {
        if (corehost) {
            logInfo('seh', 'restart core process');
            response.write('that'); // write these 4 character to indicate this is end
            response.end();
            corehost.start();
        } else {
            response.write('this'); // write these 4 character to indicate this need to be piped
            corehost = new CoreHost(response);
        }
    } else if (command == 'stop') {
        if (corehost) {
            logInfo('seh', 'stop core process');
            corehost.stop(); // this ends that response
            corehost = null;
        }
        response.statusCode = 200;
        response.end();
    }
}
