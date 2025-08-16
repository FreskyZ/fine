import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import syncfs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import path from 'node:path';
import readline from 'node:readline/promises';
import zlib from 'node:zlib';
import chalk from 'chalk-template';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import { WebSocketServer, type WebSocket } from 'ws';

dayjs.extend(utc);

function logInfo(header: string, message: string, error?: any): void {
    if (error) {
        console.log(chalk`⛅[{green ${dayjs().format('HH:mm:ss.SSS')}} {gray ${header}}] ${message}`, error);
    } else {
        console.log(chalk`⛅[{green ${dayjs().format('HH:mm:ss.SSS')}} {gray ${header}}] ${message}`);
    }
}
function logError(header: string, message: string, error?: any): void {
    if (error) {
        console.log(chalk`⛅[{green ${dayjs().format('HH:mm:ss.SSS')}} {red ${header}}] ${message}`, error);
    } else {
        console.log(chalk`⛅[{green ${dayjs().format('HH:mm:ss.SSS')}} {red ${header}}] ${message}`);
    }
}

function generateRandomText(length: number) {
    // the non-\w characters make manual copy cannot double click on word
    let result = '';
    while (!/^\w+$/.test(result)) {
        result = crypto.randomBytes(Math.ceil(length * 3 / 4)).toString('base64').slice(0, length);
    }
    return result;
}

// this is copied from content.ts and modified to fit in node:http instead of koa
class RateLimit {

    public readonly maxCount: number;
    public readonly refillRate: number;
    private readonly buckets: Record<string, { count: number, lastAccessTime: dayjs.Dayjs }> = {};
    public constructor(maxCount: number, refillRate: number) {
        this.maxCount = maxCount;
        this.refillRate = refillRate;
    }

    public request(request: http.IncomingMessage, response: http.ServerResponse) {
        let bucket = this.buckets[request.socket.remoteAddress];
        if (!bucket) {
            bucket = { count: this.maxCount, lastAccessTime: dayjs.utc() };
            this.buckets[request.socket.remoteAddress] = bucket;
        } else {
            const elapsed = dayjs.utc().diff(bucket.lastAccessTime, 'second');
            bucket.count = Math.min(this.maxCount, bucket.count + elapsed * this.refillRate);
            bucket.lastAccessTime = dayjs.utc();
        }
        bucket.count -= 1;
        if (bucket.count <= 0) {
            response.writeHead(429, 'Too Many Requests');
            response.end();
            return false;
        }
        return true;
    }
}

const config = JSON.parse(await fs.readFile('config', 'utf-8')) as {
    webroot: string,
    certificates: Record<string, { key: string, cert: string }>,
};

const [domain, certificate] = Object.entries(config.certificates)[0];
const websocketServer = new WebSocketServer({ noServer: true });
const httpServer = https.createServer({ key: await fs.readFile(certificate.key), cert: await fs.readFile(certificate.cert) });

const ratelimit = new RateLimit(10, 1);
httpServer.on('request', (request, response) => {
    if (!ratelimit.request(request, response)) { return; }
    // request.url contains query, but should be enough for this
    if (request.method == 'GET' && request.url == '/client-dev.js') {
        response.writeHead(200, 'OK');
        response.end(`const w=new WebSocket(\`wss://${domain}:8001\`,'browser');w.onmessage=e=>{if(e.data=='reload'){location.reload();}};`);
    } else {
        // upgrade does not goto here, so direct 400 is ok
        response.writeHead(400, 'Bad Request');
        response.end();
    }
});

// local connection also want this type, but this file is not transpiled and cannot reference external types
// by the way, that too
// so copy this region into that region, with // END TYPE hash validation
// also use this synchronization in admin interface, if ok, remove shared/admin.d.ts
// if very ok, remove shared/access.d.ts

// BEGIN SHARED TYPE BuildScriptMessage
export interface HasId {
    id: number,
}

// received packet format
// - magic: NIRA, packet id: u16le, kind: u8
// - kind: 1 (upload), path length: u8, path: not zero terminated, content length: u32le, content
// - kind: 2 (download), path length: u8, path: not zero terminated
// - kind: 3 (admin), command kind: u8
//   - command kind: 1 (static-content:reload), key length: u8, key: not zero terminated
//   - command kind: 2 (app:reload-server), app length: u8, app: not zero terminated
// - kind: 4 (reload-browser)
interface BuildScriptMessageUploadFile {
    kind: 'upload',
    path: string, // relative path from webroot
    content: Buffer, // this is compressed
}
interface BuildScriptMessageDownloadFile {
    kind: 'download',
    path: string, // relative path from webroot
}
interface BuildScriptMessageAdminInterfaceCommand {
    kind: 'admin',
    command:
        // remote-akari knows AdminInterfaceCommand type, local akari don't
        // this also explicitly limit local admin command range, which is ok
        | { kind: 'static-content:reload', key: string }
        | { kind: 'app-server:reload', name: string },
}
interface BuildScriptMessageReloadBrowser {
    kind: 'reload-browser',
}
type BuildScriptMessage =
    | BuildScriptMessageUploadFile
    | BuildScriptMessageDownloadFile
    | BuildScriptMessageAdminInterfaceCommand
    | BuildScriptMessageReloadBrowser;

// response packet format
// - magic: NIRA, packet id: u16le, kind: u8
// - kind: 1 (upload), status: u8 (1: ok, 2: error, 3: nodiff)
// - kind: 2 (download), content length: u32le (maybe 0 for error or empty), content
// - kind: 3 (admin), ok: u8 (0 not ok, 1 ok)
// - kind: 4 (reload-browser)
interface BuildScriptMessageResponseUploadFile {
    kind: 'upload',
    // path is not in returned data but assigned at local side
    path?: string,
    // error message is not in returned data but displayed here
    status: 'ok' | 'error' | 'nodiff',
}
interface BuildScriptMessageResponseDownloadFile {
    kind: 'download',
    // path is not in returned data but assigned at local side
    path?: string,
    // this is compressed
    // empty means error or empty
    // error message is not in returned data but displayed here
    content: Buffer,
}
interface BuildScriptMessageResponseAdminInterfaceCommand {
    kind: 'admin',
    // response log is not in returned data but displayed here
    ok: boolean,
    // command is not in returned data but assigned at local side
    command?: BuildScriptMessageAdminInterfaceCommand['command'],
}
interface BuildScriptMessageResponseReloadBrowser {
    kind: 'reload-browser',
}
type BuildScriptMessageResponse =
    | BuildScriptMessageResponseUploadFile
    | BuildScriptMessageResponseDownloadFile
    | BuildScriptMessageResponseAdminInterfaceCommand
    | BuildScriptMessageResponseReloadBrowser;
// END SHARED TYPE BuildScriptMessage

const DebugBuildScriptMessageParser = false;
class BuildScriptMessageParser {
    private chunk: Buffer = Buffer.allocUnsafe(0); // working chunk
    public push(newChunk: Buffer) {
        this.chunk = Buffer.concat([this.chunk, newChunk]);
    }

    private position: number = 0; // working position
    private state: 
        | 'magic'
        | 'skip-to-next-magic'
        | 'packet-id'
        | 'packet-kind'
        | 'upload-path-length'
        | 'upload-path'
        | 'upload-content-length'
        | 'upload-content'
        | 'download-path-length'
        | 'download-path'
        | 'admin-command-kind'
        | 'admin-static-content-key-length'
        | 'admin-static-content-key'
        | 'admin-reload-server-name-length'
        | 'admin-reload-server-name' = 'magic';
    private packetId: number;
    private packetKind: number;
    private uploadPathLength: number;
    private uploadPath: string;
    private uploadContentLength: number;
    private downloadPathLength: number;
    private adminCommandKind: number;
    private reloadStaticKeyLength: number;
    private reloadServerNameLength: number;

    private hasEnoughLength(expect: number) {
        return this.chunk.length - this.position >= expect;
    }
    // reset and cleanup after finished one message
    private reset() {
        this.state = 'magic';
        this.chunk = this.chunk.subarray(this.position);
        this.position = 0;
    }

    // try pull one message, if not enough, return null
    public pull(): BuildScriptMessage & HasId {
        while (true) {
            if (this.state == 'magic') {
                if (!this.hasEnoughLength(4)) { return null; }
                const maybeMagic = this.chunk.toString('utf-8', this.position, this.position + 4);
                if (maybeMagic != 'NIRA') {
                    logError('parser', `state = ${this.state}, meet ${maybeMagic} (${this.chunk.subarray(this.position, this.position + 4)})`);
                    this.state = 'skip-to-next-magic';
                } else {
                    this.position += 4;
                    this.state = 'packet-id';
                }
            } else if (this.state == 'skip-to-next-magic') {
                if (!this.hasEnoughLength(4)) { return null; }
                const maybeIndex = this.chunk.indexOf('NIRA', this.position);
                // NOTE this 0 happens when previous packet is completely skipped and next packet is correct
                if (maybeIndex >= 0) {
                    if (DebugBuildScriptMessageParser) { logInfo('parser', `state = ${this.state}, skip ${maybeIndex} bytes and find next magic`); }
                    this.position += maybeIndex + 4;
                    this.state = 'packet-id';
                } else {
                    if (DebugBuildScriptMessageParser) { logInfo('parser', `state = ${this.state}, skip ${this.chunk.length - this.position} bytes and still seeking next magic`); }
                    this.chunk = Buffer.allocUnsafe(0); // cleanup by the way
                    this.position = 0;
                }
            } else if (this.state == 'packet-id') {
                if (!this.hasEnoughLength(2)) { return null; }
                this.packetId = this.chunk.readUInt16LE(this.position);
                this.position += 2;
                if (DebugBuildScriptMessageParser) { logInfo('parser', `state = ${this.state}, packet id ${this.packetId}`); }
                this.state = 'packet-kind';
            } else if (this.state == 'packet-kind') {
                if (!this.hasEnoughLength(1)) { return null; }
                this.packetKind = this.chunk.readUInt8(this.position);
                this.position += 1;
                if (this.packetKind == 1) {
                    if (DebugBuildScriptMessageParser) { logInfo('parser', `state = ${this.state}, packet kind ${this.packetKind} upload`); }
                    this.state = 'upload-path-length';
                } else if (this.packetKind == 2) {
                    if (DebugBuildScriptMessageParser) { logInfo('parser', `state = ${this.state}, packet kind ${this.packetKind} download`); }
                    this.state = 'download-path-length';
                } else if (this.packetKind == 3) {
                    if (DebugBuildScriptMessageParser) { logInfo('parser', `state = ${this.state}, packet kind ${this.packetKind} admin`); }
                    this.state = 'admin-command-kind';
                } else if (this.packetKind == 4) {
                    if (DebugBuildScriptMessageParser) { logInfo('parser', `state = ${this.state}, packet kind ${this.packetKind} reload-browser`); }
                    this.reset();
                    return { id: this.packetId, kind: 'reload-browser' };
                } else {
                    logError('parser', `state = ${this.state}, packet kind ${this.packetKind} invalid`);
                    this.state = 'skip-to-next-magic';
                }
            } else if (this.state == 'upload-path-length') {
                if (!this.hasEnoughLength(1)) { return null; }
                this.uploadPathLength = this.chunk.readUInt8(this.position);
                this.position += 1;
                if (DebugBuildScriptMessageParser) { logInfo('parser', `state = ${this.state}, kind = upload, path length ${this.uploadPathLength}`); }
                this.state = 'upload-path';
            } else if (this.state == 'upload-path') {
                if (!this.hasEnoughLength(this.uploadPathLength)) { return null; }
                this.uploadPath = this.chunk.toString('utf-8', this.position, this.position + this.uploadPathLength);
                this.position += this.uploadPathLength;
                if (DebugBuildScriptMessageParser) { logInfo('parser', `state = ${this.state}, kind = upload, path ${this.uploadPath}`); }
                this.state = 'upload-content-length';
            } else if (this.state == 'upload-content-length') {
                if (!this.hasEnoughLength(4)) { return null; }
                this.uploadContentLength = this.chunk.readUint32LE(this.position);
                this.position += 4;
                if (DebugBuildScriptMessageParser) { logInfo('parser', `state = ${this.state}, kind = upload, content length ${this.uploadContentLength}`); }
                this.state = 'upload-content';
            } else if (this.state == 'upload-content') {
                if (!this.hasEnoughLength(this.uploadContentLength)) { return null; }
                const content = this.chunk.subarray(this.position, this.position + this.uploadContentLength);
                this.position += this.uploadContentLength;
                if (DebugBuildScriptMessageParser) { logInfo('parser', `state = ${this.state}, kind = upload, content full filled`); }
                this.reset();
                return { id: this.packetId, kind: 'upload', path: this.uploadPath, content }; 
            } else if (this.state == 'download-path-length') {
                if (!this.hasEnoughLength(1)) { return null; }
                this.downloadPathLength = this.chunk.readUInt8(this.position);
                this.position += 1;
                if (DebugBuildScriptMessageParser) { logInfo('parser', `state = ${this.state}, kind = download, path length ${this.downloadPathLength}`); }
                this.state = 'download-path';
            } else if (this.state == 'download-path') {
                if (!this.hasEnoughLength(this.downloadPathLength)) { return null; }
                const downloadPath = this.chunk.toString('utf-8', this.position, this.position + this.downloadPathLength);
                this.position += this.downloadPathLength;
                if (DebugBuildScriptMessageParser) { logInfo('parser', `state = ${this.state}, kind = download, path ${downloadPath}`); }
                this.reset();
                return { id: this.packetId, kind: 'download', path: downloadPath };
            } else if (this.state == 'admin-command-kind') {
                if (!this.hasEnoughLength(1)) { return null; }
                this.adminCommandKind = this.chunk.readUInt8(this.position);
                this.position += 1;
                if (this.adminCommandKind == 1) {
                    if (DebugBuildScriptMessageParser) { logInfo('parser', `state = ${this.state}, kind = admin, command kind ${this.adminCommandKind} static-content:reload`); }
                    this.state = 'admin-static-content-key-length';
                } else if (this.adminCommandKind == 2) {
                    if (DebugBuildScriptMessageParser) { logInfo('parser', `state = ${this.state}, kind = admin, command kind ${this.adminCommandKind} app:reload-server`); }
                    this.state = 'admin-reload-server-name-length';
                }else {
                    logError('parser', `state = ${this.state}, kind = admin, command kind ${this.packetKind} invalid`);
                    this.state = 'skip-to-next-magic';
                }
            } else if (this.state == 'admin-static-content-key-length') {
                if (!this.hasEnoughLength(1)) { return null; }
                this.reloadStaticKeyLength = this.chunk.readUInt8(this.position);
                this.position += 1;
                if (DebugBuildScriptMessageParser) { logInfo('parser', `state = ${this.state}, kind = admin, command = static-content:reload, key length ${this.reloadStaticKeyLength}`); }
                this.state = 'admin-static-content-key';
            } else if (this.state == 'admin-static-content-key') {
                if (!this.hasEnoughLength(this.reloadStaticKeyLength)) { return null; }
                const key = this.chunk.toString('utf-8', this.position, this.position + this.reloadStaticKeyLength);
                this.position += this.reloadStaticKeyLength;
                if (DebugBuildScriptMessageParser) { logInfo('parser', `state = ${this.state}, kind = admin, command = static-content:reload, key ${key}`); }
                this.reset();
                return { id: this.packetId, kind: 'admin', command: { kind: 'static-content:reload', key } };
            } else if (this.state == 'admin-reload-server-name-length') {
                if (!this.hasEnoughLength(1)) { return null; }
                this.reloadServerNameLength = this.chunk.readUInt8(this.position);
                this.position += 1;
                if (DebugBuildScriptMessageParser) { logInfo('parser', `state = ${this.state}, kind = admin, command = app:reload-server, name length ${this.reloadServerNameLength}`); }
                this.state = 'admin-reload-server-name';
            } else if (this.state == 'admin-reload-server-name') {
                if (!this.hasEnoughLength(this.reloadServerNameLength)) { return null; }
                const name = this.chunk.toString('utf-8', this.position, this.position + this.reloadServerNameLength);
                this.position += this.reloadServerNameLength;
                if (DebugBuildScriptMessageParser) { logInfo('parser', `state = ${this.state}, kind = admin, command = app:reload-server, name ${name}`); }
                this.reset();
                return { id: this.packetId, kind: 'admin', command: { kind: 'app-server:reload', name } };
            } else {
                logError('parser', `invalid state? ${this.state}`);
            }
        }
    }
}

let buildScriptConnection: WebSocket;
const buildScriptConnectionEventEmitter: EventEmitter<{
    'message': [BuildScriptMessage & HasId],
    'disconnect': [null],
}> = new EventEmitter();
const buildScriptMessageParser = new BuildScriptMessageParser();
const browserWebsocketConnections: WebSocket[] = [];

httpServer.on('upgrade', (request, socket, header) => {
    const protocol = request.headers['sec-websocket-protocol'];
    if (protocol != 'akari' && protocol != 'browser') {
        logError('upgrade', `invalid path ${request.url}`);
        socket.write('HTTP 1.1 400 Bad Request\r\n\r\n');
        socket.destroy();
        return;
    }
    websocketServer.handleUpgrade(request, socket, header, websocket => {
        if (protocol == 'browser') {
            logInfo(`upgrade-for-browser`, `connected`);
            websocket.on('close', () => {
                logInfo(`upgrade-for-browser`, `disconnected`);
                const index = browserWebsocketConnections.indexOf(websocket);
                if (index >= 0) { browserWebsocketConnections.splice(index, 1); }
            });
            browserWebsocketConnections.push(websocket);
        } else if (protocol == 'akari') {
            if (buildScriptConnection) {
                logError(`upgrade-for-build-script`, `reject another connection, you seems to forget close previous one`);
                websocket.close();
                return;
            }
            const token = generateRandomText(8);
            logInfo(`upgrade-for-build-script`, `authenticating, send ${token} at other side`);
            const timeout = setTimeout(() => {
                logInfo(`upgrade-for-build-script`, `authentication timeout`);
                websocket.close();
            }, 30_000);
            websocket.once('message', buffer => {
                if (buffer.toString('utf-8') != token) {
                    logInfo(`upgrade-for-build-script`, `received unexpected message ${buffer}`);
                    websocket.close();
                    return;
                }
                if (buildScriptConnection) {
                    logError('upgrade-for-build-script', 'other connection authenticated, abort this');
                    websocket.close();
                    return;
                }
                clearTimeout(timeout);
                websocket.send('authenticated');
                logInfo(`upgrade-for-build-script`, `authenticated`);
                websocket.on('close', () => {
                    logInfo(`upgrade-for-build-script`, `disconnected`);
                    buildScriptConnection = null;
                    buildScriptConnectionEventEmitter.emit('disconnect', null);
                });
                websocket.on('message', buffer => {
                    const buffers = Array.isArray(buffer) ? buffer : Buffer.isBuffer(buffer) ? [buffer] : [Buffer.from(buffer)];
                    for (const buffer of buffers) {
                        logInfo(`upgrade-for-build-script`, `received raw data ${buffer.length} bytes`);
                        buildScriptMessageParser.push(buffer);
                        const maybeMessage = buildScriptMessageParser.pull();
                        if (maybeMessage) { buildScriptConnectionEventEmitter.emit('message', maybeMessage); }
                    }
                });
                buildScriptConnection = websocket;
            });
        }
    });
});
httpServer.listen(8001, () => logInfo('http+websocket', 'listening 8001'));

function shutdown() {
    logInfo('akari', 'closing');
    // websocket.close have no close callback, lazy to wait on close event
    buildScriptConnection?.close();
    browserWebsocketConnections.forEach(c => c.close());
    // timeout close
    setTimeout(() => { logInfo('akari', 'close timeout, abort'); process.exit(1); }, 10_000);
    httpServer.close(error => {
        if (error) {
            console.log(error);
            process.exit(1);
        }
        process.exit(0);
    });
}

// BEGIN SHARED TYPE AdminInterfaceCommand
export interface HasId {
    id: number,
}
export type AdminInterfaceCommand =
    | { kind: 'ping' }
    | { kind: 'shutdown' }
    | { kind: 'static-content:reload', key: string }
    | { kind: 'static-content:reload-config' }
    | { kind: 'static-content:server:reload', name: string }
    | { kind: 'static-content:short-link:reload' }
    | { kind: 'access-control:revoke', sessionId: number }
    | { kind: 'access-control:user:enable', userId: number }
    | { kind: 'access-control:user:disable', userId: number }
    | { kind: 'access-control:signup:enable' }
    | { kind: 'access-control:signup:disable' }
    | { kind: 'access-control:display-rate-limits' } // guess will be interesting
    | { kind: 'access-control:display-user-sessions' } // with new response-ful design, you can get
    | { kind: 'access-control:display-application-sessions' } // with new response-ful design, you can get
    | { kind: 'app-server:reload', name: string };

export interface AdminInterfaceResponse {
    ok: boolean,
    log: string,
    [p: string]: any,
}
// END SHARED TYPE AdminInterfaceCommand

let adminInterfaceConnection: net.Socket;
const adminInterfaceResponseWakers: Record<number, (response: AdminInterfaceResponse) => void> = {};
function connectAdminInterface() {
    try {
        adminInterfaceConnection = net.connect('/tmp/fine.socket');
    } catch (error) {
        logInfo('admin-interface', `connect error`, error);
        return;
    }
    adminInterfaceConnection.on('connect', () => {
        logInfo('admin-interface', `connected`);
    });
    adminInterfaceConnection.on('data', data => {
        const text = data.toString('utf-8');
        logInfo('admin-interface', `received ${text}`);
        try {
            const response: AdminInterfaceResponse & HasId = JSON.parse(text);
            if (!response.id) {
                logError('admin-interface', `received response without id, when will this happen?`);
            } else if (!(response.id in adminInterfaceResponseWakers)) {
                logError('admin-interface', `no waker found for received response, when will this happen?`);
            } else {
                adminInterfaceResponseWakers[response.id](response);
                delete adminInterfaceResponseWakers[response.id];
            }
        } catch (error) {
            logError('admin-interface', `received data failed to parse json`, error);
        }
    });
    adminInterfaceConnection.on('error', error => {
        adminInterfaceConnection = null;
        logError('admin-interface', 'error: ', error);
    });
    adminInterfaceConnection.on('timeout', () => {
        adminInterfaceConnection.destroy(); // close is not auto called after this event
        adminInterfaceConnection = null;
        logError('admin-interface', 'timeout, abort connection');
    });
    adminInterfaceConnection.on('close', () => {
        adminInterfaceConnection = null;
        logInfo('admin-interface', 'connection closed');
    });
}

connectAdminInterface();
let adminInterfaceCommandIdNext: number = 1;
async function sendAdminCommand(command: AdminInterfaceCommand): Promise<AdminInterfaceResponse> {
    if (!adminInterfaceConnection) {
        logError('admin-interface', "not connect, use 'connect admin interface' to connect");
        return null;
    }
    const commandId = adminInterfaceCommandIdNext;
    const commandWithId: AdminInterfaceCommand & HasId = { id: commandId, ...command };
    adminInterfaceCommandIdNext += 1;
    const serializedCommand = JSON.stringify(commandWithId);
    logInfo('admin-interface', `send ${serializedCommand}`);

    let timeout: any;
    const responseReceived = new Promise<AdminInterfaceResponse>(resolve => {
        adminInterfaceResponseWakers[commandId] = response => {
            if (timeout) { clearTimeout(timeout); }
            resolve(response);
        };
    });
    adminInterfaceConnection.write(serializedCommand);

    return await Promise.any([
        responseReceived,
        new Promise<AdminInterfaceResponse>(resolve => {
            timeout = setTimeout(() => {
                delete adminInterfaceResponseWakers[commandId];
                logError('admin-interface', `command ${commandId} timeout`);
                resolve(null);
            }, 30_000);
        }),
    ]);
}

function sendBuildScriptMessageResponse(messageId: number, response: BuildScriptMessageResponse) {
    let buffer: Buffer;
    if (response.kind == 'upload') {
        buffer = Buffer.alloc(8);
        buffer.write('NIRA', 0); // magic size 4
        buffer.writeUInt16LE(messageId, 4); // packet id size 2
        buffer.writeUInt8(1, 6); // kind size 1
        buffer.writeUInt8(response.status == 'ok' ? 1 : response.status == 'error' ? 2 : 3, 7); // status size 1
        logInfo('tunnel', `return #${messageId} upload status ${response.status}`);
    } else if (response.kind == 'download') {
        const contentLength = response.content?.length ?? 0;
        buffer = Buffer.alloc(11 + contentLength);
        buffer.write('NIRA', 0); // magic size 4
        buffer.writeUInt16LE(messageId, 4); // packet id size 2
        buffer.writeUInt8(2, 6); // kind size 1
        buffer.writeUInt32LE(contentLength, 7); // content length size 4
        if (contentLength) { response.content.copy(buffer, 11, 0); }
        logInfo('tunnel', `return #${messageId} download compress size ${contentLength}bytes`);
    } else if (response.kind == 'admin') {
        buffer = Buffer.alloc(8);
        buffer.write('NIRA', 0); // magic size 4
        buffer.writeUInt16LE(messageId, 4); // packet id size 2
        buffer.writeUInt8(3, 6); // kind size 1
        buffer.writeUInt8(response.ok ? 1 : 0, 6); // ok size 1
        logInfo('tunnel', `return #${messageId} admin response ${response.ok ? 'ok' : 'not ok'}`);
    } else if (response.kind == 'reload-browser') {
        buffer = Buffer.alloc(7);
        buffer.write('NIRA', 0); // magic size 4
        buffer.writeUInt16LE(messageId, 4); // packet id size 2
        buffer.writeUInt8(4, 6); // kind size 1
        logInfo('tunnel', `return #${messageId} reload browser`);
    }
    buildScriptConnection?.send(buffer);
}
buildScriptConnectionEventEmitter.addListener('message', async message => {
    if (message.kind == 'admin') {
        const response = await sendAdminCommand(message.command);
        sendBuildScriptMessageResponse(message.id, { kind: 'admin', ok: response?.ok });
    } else if (message.kind == 'reload-browser') {
        browserWebsocketConnections.forEach(c => c.send('reload'));
        if (browserWebsocketConnections.length) {
            logInfo('akari', 'forward reload-browser');
        } else {
            logInfo('akari', 'no browser websocket connection currently');
        }
        sendBuildScriptMessageResponse(message.id, { kind: 'reload-browser' });
    } else if (message.kind == 'upload') {
        logInfo('fs', `upload ${message.path}`);
        const fullpath = path.join(config.webroot, message.path);
        if (!syncfs.existsSync(path.dirname(fullpath))) {
            logError('fs', `require path ${fullpath} parent folder not exist, it is by design to not create parent folder here`);
            return sendBuildScriptMessageResponse(message.id, { kind: 'upload', status: 'error' });
        }
        zlib.zstdDecompress(message.content, async (error, messageContent) => {
            if (error) {
                logError('fs', `message content decompress error`, error);
                return sendBuildScriptMessageResponse(message.id, { kind: 'upload', status: 'error' });
            }
            try {
                if (syncfs.existsSync(fullpath)) {
                    const originalContent = await fs.readFile(fullpath);
                    if (Buffer.compare(messageContent, originalContent) == 0) {
                        logInfo('fs', `${fullpath} content same, no update`);
                        return sendBuildScriptMessageResponse(message.id, { kind: 'upload', status: 'nodiff' });
                    }
                }
                // if (!syncfs.existsSync(path.dirname(fullpath))) {
                //     await fs.mkdir(path.dirname(fullpath), { recursive: true });
                // }
                await fs.writeFile(fullpath, messageContent);
                sendBuildScriptMessageResponse(message.id, { kind: 'upload', status: 'ok' });
            } catch (error) {
                logError('fs', `seems file system operation error`, error);
                sendBuildScriptMessageResponse(message.id, { kind: 'upload', status: 'error' });
            }
        });
    } else if (message.kind == 'download') {
        logInfo('fs', `download ${message.path}`);
        const fullpath = path.join(config.webroot, message.path);
        if (!syncfs.existsSync(fullpath)) {
            logError('fs', `requested path ${fullpath} not exist`);
            return sendBuildScriptMessageResponse(message.id, { kind: 'download', content: null });
        }
        try {
            const content = await fs.readFile(fullpath);
            zlib.zstdCompress(content, async (error, compressedContent) => {
                if (error) {
                    logError('fs', `file content compress error`, error);
                    return sendBuildScriptMessageResponse(message.id, { kind: 'download', content: null });
                }
                sendBuildScriptMessageResponse(message.id, { kind: 'download', content: compressedContent });
            });
        } catch (error) {
            logError('fs', `seems file system operation error (2)`, error);
            sendBuildScriptMessageResponse(message.id, { kind: 'download', content: null });
        }
    }
});

const interactiveReader = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    removeHistoryDuplicates: true,
});
interactiveReader.on('SIGINT', () => { shutdown(); });
interactiveReader.prompt();
for await (const raw of interactiveReader) {
    interactiveReader.pause();
    const line = raw.trim();
    if (line.length == 0) {
        interactiveReader.prompt();
    } else if (line == 'exit') {
        shutdown();
    } else if (line == 'connect admin interface') {
        if (!adminInterfaceConnection) {
            connectAdminInterface();
        } else {
            logInfo('shell', 'already connected, don\'t connect again');
        }
        interactiveReader.prompt();
    } else if (line == 'reload config') {
        await sendAdminCommand({ kind: 'static-content:reload-config' });
        interactiveReader.prompt();
    } else if (line == 'reload user') {
        await sendAdminCommand({ kind: 'static-content:reload', key: 'user' });
        interactiveReader.prompt();
    } else if (line == 'reload yala') {
        await sendAdminCommand({ kind: 'static-content:reload', key: 'yala' });
        interactiveReader.prompt();
    } else if (line.startsWith('reload static ')) {
        await sendAdminCommand({ kind: 'static-content:reload', key: line.substring(14).trim() });
        interactiveReader.prompt();
    } else if (line.startsWith('reload server ')) {
        await sendAdminCommand({ kind: 'app-server:reload', name: line.substring(14).trim() });
        interactiveReader.prompt();
    } else if (line == 'display application sessions') {
        await sendAdminCommand({ kind: 'access-control:display-application-sessions' });
        interactiveReader.prompt();
    } else if (line == 'display rate limits') {
        await sendAdminCommand({ kind: 'access-control:display-rate-limits' });
        interactiveReader.prompt();
    } else if (line.startsWith('!')) {
        const shellCommand = line.slice(1);
        const child = spawn(shellCommand, { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
        child.stdout.on('data', data => process.stdout.write(data));
        child.stderr.on('data', data => process.stderr.write(data));
        child.on('close', code => {
            logInfo('shell', `shell command process exited with code ${code}`);
            interactiveReader.prompt();
        });
        child.on('error', error => {
            logError('shell', 'failed to start shell command:', error);
            interactiveReader.prompt();
        });
    } else {
        logError('interactive', `unknown command ${line}`);
        interactiveReader.prompt();
    }
}
