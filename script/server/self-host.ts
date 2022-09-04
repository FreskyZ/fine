import * as cp from 'child_process';
import type * as stream from 'stream';
import type * as http from 'http';
import * as chalk from 'chalk';
import * as dayjs from 'dayjs';
import type { AdminSelfHostCommand } from '../../src/shared/types/admin';
import { logInfo, logError } from '../common';
import { send as sendToServerCore } from './server-core';

// manage self hosted server-core for watching
// sch: server-core host

function writeInfo(writable: stream.Writable, header: string, message: string) {
    writable.write(chalk`[{green ${dayjs().format('HH:mm:ss.SSS')}} {gray ${header}}] ${message}\n`);
}
function writeError(writable: stream.Writable, header: string, message: string) {
    writable.write(chalk`[{green ${dayjs().format('HH:mm:ss.SSS')}} {red ${header}}] ${message}\n`);
}

// host server core by akari (server) when watch server-core
let serverCoreHost: ServerCoreHost | null = null;
export function stop(): void { if (serverCoreHost) { serverCoreHost.stop(); } } // stop when shutdown

class ServerCoreHost {
    private theProcess: cp.ChildProcessWithoutNullStreams | null = null;
    public constructor(private readonly response: http.ServerResponse) {
        this.startimpl();
    }

    private startimpl() {
        logInfo('sch', 'start server-core');
        writeInfo(this.response, 'akr(server)', 'start server-core');
        this.theProcess = cp.spawn(process.argv0, ['index.js']); // spawn seems to fail to find `node` in PATH when start by systemctl, use argv0 because I use absolute path in systemctl setup
        this.theProcess.stdout.pipe(this.response, { end: false });
        this.theProcess.stderr.pipe(this.response, { end: false });
        this.theProcess.on('error', error => {
            // document says this happens when process failed to spawn, failed to exit or failed to send message
            // I do not use the send message feature and do not exit by theProcess.kill() so this should only be happen when failed to spawn
            // in that case, theProcess reference should also be discard
            writeError(this.response, 'akr(server)', `server-core process error ${error.message}`);
            logError('sch', `process error ${error.message}`, error);
            this.theProcess = null;
        });
        this.theProcess.on('exit', code => {
            (code == 0 ? writeInfo : writeError)(this.response, 'akr(server)', `server-core process exit with code ${code}`);
            (code == 0 ? logInfo : logError)('sch', `server-core process exit with code ${code}`);
            this.theProcess = null;
        });
        this.theProcess.unref();
    }
    public start() {
        if (this.theProcess != null) {
            this.theProcess.once('exit', this.startimpl.bind(this));
            sendToServerCore({ type: 'shutdown' }).then(result => {
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
        sendToServerCore({ type: 'shutdown' }).then(result => {
            if (result) {
                writeInfo(this.response, 'akr(server)', chalk`ack {yellow shutdown} (2)`);
            } else {
                writeError(this.response, 'akr(server)', chalk`fail {yellow shutdown} (2)`);
            }
            this.response.end();
        });
    }
}

export function handle(command: AdminSelfHostCommand, response: http.ServerResponse): void {
    response.statusCode = 200;
    if (command == 'start') {
        if (serverCoreHost) {
            logInfo('sch', 'restart server-core');
            response.write('that'); // write these 4 character to indicate this is end
            response.end();
            serverCoreHost.start();
        } else {
            response.write('this'); // write these 4 character to indicate this need to be piped
            serverCoreHost = new ServerCoreHost(response);
        }
    } else if (command == 'stop') {
        if (serverCoreHost) {
            logInfo('sch', 'stop host server-core');
            serverCoreHost.stop(); // this ends that response
            serverCoreHost = null;
        }
        response.statusCode = 200;
        response.end();
    }
}
