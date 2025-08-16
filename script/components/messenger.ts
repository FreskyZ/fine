import fs from 'node:fs/promises';
import type { Interface } from 'node:readline/promises';
import tls from 'node:tls';
import { zstdCompress, zstdDecompress } from 'node:zlib';
import { scriptconfig, logInfo, logError } from './common.ts';
import type { UploadAsset } from './sftp.ts';
import type { MyPackContext } from './mypack.ts';

// messenger: message sender abbreviated as messenger

// use this to avoid global variables because currently no other major global variables used
/* eslint-disable @stylistic/quote-props -- ? */
interface MessengerContext {
    '?'?: boolean, // ?
    readline: Interface,
    connection?: WebSocket,
    // id to waker (the promise resolver)
    wakers?: Record<number, (data: BuildScriptMessageResponse) => void>,
    nextMessageId?: number,
    reconnectCount?: number,
    // store last mcx for report
    lastmcxStorage?: Record<string, MyPackContext>,
}

/* eslint-disable @stylistic/operator-linebreak -- false positive for type X =\n| Variant1\n| Variant2 */
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
class BuildScriptMessageResponseParser {

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
        | 'upload-status'
        | 'download-content-length'
        | 'download-content'
        | 'admin-command-status' = 'magic';
    private packetId: number;
    private packetKind: number;
    private downloadContentLength: number;

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
    public pull(): BuildScriptMessageResponse & HasId {
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
                    this.state = 'upload-status';
                } else if (this.packetKind == 2) {
                    if (DebugBuildScriptMessageParser) { logInfo('parser', `state = ${this.state}, packet kind ${this.packetKind} download`); }
                    this.state = 'download-content-length';
                } else if (this.packetKind == 3) {
                    if (DebugBuildScriptMessageParser) { logInfo('parser', `state = ${this.state}, packet kind ${this.packetKind} admin`); }
                    this.state = 'admin-command-status';
                } else if (this.packetKind == 4) {
                    if (DebugBuildScriptMessageParser) { logInfo('parser', `state = ${this.state}, packet kind ${this.packetKind} reload-browser`); }
                    this.reset();
                    return { id: this.packetId, kind: 'reload-browser' };
                } else {
                    logError('parser', `state = ${this.state}, packet kind ${this.packetKind} invalid`);
                    this.state = 'skip-to-next-magic';
                }
            } else if (this.state == 'upload-status') {
                if (!this.hasEnoughLength(1)) { return null; }
                const uploadStatus = this.chunk.readUInt8(this.position);
                const statusName = uploadStatus == 1 ? 'ok' : uploadStatus == 2 ? 'error' : uploadStatus == 3 ? 'nodiff' : 'error';
                this.position += 1;
                if (DebugBuildScriptMessageParser) { logInfo('parser', `state = ${this.state}, kind = upload, status ${uploadStatus} (${statusName})`); }
                this.reset();
                return { id: this.packetId, kind: 'upload', status: statusName };
            } else if (this.state == 'download-content-length') {
                if (!this.hasEnoughLength(4)) { return null; }
                this.downloadContentLength = this.chunk.readUint32LE(this.position);
                this.position += 4;
                if (DebugBuildScriptMessageParser) { logInfo('parser', `state = ${this.state}, kind = download, content length ${this.downloadContentLength}`); }
                this.state = 'download-content';
            } else if (this.state == 'download-content') {
                if (!this.hasEnoughLength(this.downloadContentLength)) { return null; }
                const content = this.chunk.subarray(this.position, this.position + this.downloadContentLength);
                this.position += this.downloadContentLength;
                if (DebugBuildScriptMessageParser) { logInfo('parser', `state = ${this.state}, kind = download, content full filled`); }
                this.reset();
                return { id: this.packetId, kind: 'download', content };
            } else if (this.state == 'admin-command-status') {
                if (!this.hasEnoughLength(1)) { return null; }
                const commandStatus = this.chunk.readUInt8(this.position);
                const commandStatusOk = commandStatus == 1;
                this.position += 1;
                if (DebugBuildScriptMessageParser) { logInfo('parser', `state = ${this.state}, kind = admin, status ${commandStatus} (${commandStatusOk}`); }
                this.reset();
                return { id: this.packetId, kind: 'admin', ok: commandStatusOk };
            } else {
                logError('parser', `invalid state? ${this.state}`);
            }
        }
    }
}
const buildScriptMessageResponseParser = new BuildScriptMessageResponseParser();

// return true for connected
export async function connectRemote(ecx: MessengerContext) {
    if (!ecx['?']) {
        // ???
        const myCertificate = await fs.readFile(scriptconfig.certificate, 'utf-8');
        const originalCreateSecureContext = tls.createSecureContext;
        tls.createSecureContext = options => {
            const originalResult = originalCreateSecureContext(options);
            if (!options.ca) {
                originalResult.context.addCACert(myCertificate);
            }
            return originalResult;
        };
        ecx['?'] = true;
        // this place exactly can use to initialize member fields
        ecx.reconnectCount = 0;
        ecx.nextMessageId = 1;
        ecx.wakers = {};
        ecx.lastmcxStorage = {};
    }
    if (ecx.reconnectCount >= 3) {
        ecx.reconnectCount = 0;
        logError('tunnel', 'connect retry time >= 3, you may manually reconnect later');
        return false;
    }

    return new Promise<boolean>(resolve => {
        const websocket = new WebSocket(`wss://${scriptconfig.domain}:8001`, 'akari');

        // the close event may not be called after error event is called
        // but normally will, use this to avoid duplicate invocation of reconnect
        // https://stackoverflow.com/questions/38181156/websockets-is-an-error-event-always-followed-by-a-close-event
        let reconnectInvoked = false;

        websocket.addEventListener('open', async () => {
            ecx.reconnectCount = 0;
            logInfo('tunnel', `connected, you'd better complete authentication quickly`);
            const token = await ecx.readline.question('> ');
            websocket.send(token);
        });
        websocket.addEventListener('close', async () => {
            logInfo('tunnel', `websocket disconnected`);
            if (!reconnectInvoked) {
                ecx.reconnectCount += 1;
                resolve(await connectRemote(ecx));
            }
        });
        websocket.addEventListener('error', async () => {
            // this event have error parameter, but that does not have any meaningful property, so omit
            logError('tunnel', `websocket error`);
            reconnectInvoked = true;
            ecx.reconnectCount += 1;
            resolve(await connectRemote(ecx));
        });

        websocket.addEventListener('message', async event => {
            if (event.data == 'authenticated') {
                ecx.connection = websocket;
                logInfo('tunnel', 'websocket received authenticated');
                // this resolve should be most normal case
                resolve(true);
            } else {
                // logInfo('tunnel', 'websocket received', event.data);
                const buffers = Array.isArray(event.data) ? event.data
                    : Buffer.isBuffer(event.data) ? [event.data]
                    : event.data instanceof Blob ? [Buffer.from(await event.data.arrayBuffer())]
                    : [Buffer.from(event.data)];
                for (const buffer of buffers) {
                    logInfo(`tunnel`, `websocket received raw data ${buffer.length} bytes`);
                    buildScriptMessageResponseParser.push(buffer);
                    const response = buildScriptMessageResponseParser.pull();
                    if (response) {
                        if (!response.id) {
                            logError('tunnel', `received response without id, when will this happen?`);
                        } else if (!(response.id in ecx.wakers)) {
                            logError('tunnel', `no waker found for received response, when will this happen?`);
                        } else {
                            ecx.wakers[response.id](response);
                            delete ecx.wakers[response.id];
                        }
                    }
                }
            }
        });
    });
}

export async function sendRemoteMessage(ecx: MessengerContext, message: BuildScriptMessageUploadFile): Promise<BuildScriptMessageResponseUploadFile>;
export async function sendRemoteMessage(ecx: MessengerContext, message: BuildScriptMessageDownloadFile): Promise<BuildScriptMessageResponseDownloadFile>;
export async function sendRemoteMessage(ecx: MessengerContext, message: BuildScriptMessageAdminInterfaceCommand): Promise<BuildScriptMessageResponseAdminInterfaceCommand>;
export async function sendRemoteMessage(ecx: MessengerContext, message: BuildScriptMessageReloadBrowser): Promise<BuildScriptMessageResponseReloadBrowser>;
export async function sendRemoteMessage(ecx: MessengerContext, message: BuildScriptMessage): Promise<BuildScriptMessageResponse> {
    if (!ecx.connection) {
        logError('tunnel', "not connected, type 'connect remote' to reconnect");
        return null;
    }

    const messageId = ecx.nextMessageId;
    ecx.nextMessageId += 1;

    let buffer: Buffer;
    if (message.kind == 'upload') {
        buffer = Buffer.alloc(12 + message.path.length + message.content.length);
        buffer.write('NIRA', 0); // magic size 4
        buffer.writeUInt16LE(messageId, 4); // packet id size 2
        buffer.writeUInt8(1, 6); // kind size 1
        buffer.writeUInt8(message.path.length, 7); // path length size 1
        buffer.write(message.path, 8);
        buffer.writeUInt32LE(message.content.length, message.path.length + 8); // content length size 4
        message.content.copy(buffer, 12 + message.path.length, 0);
        logInfo('tunnel', `send #${messageId} upload ${message.path} compress size ${message.content.length}bytes`);
    } else if (message.kind == 'download') {
        buffer = Buffer.alloc(8 + message.path.length);
        buffer.write('NIRA', 0); // magic size 4
        buffer.writeUInt16LE(messageId, 4); // packet id size 2
        buffer.writeUInt8(2, 6); // kind size 1
        buffer.writeUInt8(message.path.length, 7); // path length size 1
        buffer.write(message.path, 8);
        logInfo('tunnel', `send #${messageId} download ${message.path}`);
    } else if (message.kind == 'admin') {
        if (message.command.kind == 'static-content:reload') {
            buffer = Buffer.alloc(9 + message.command.key.length);
            buffer.write('NIRA', 0); // magic size 4
            buffer.writeUInt16LE(messageId, 4); // packet id size 2
            buffer.writeUInt8(3, 6); // kind size 1
            buffer.writeUInt8(1, 7); // command kind size 1
            buffer.writeUInt8(message.command.key.length, 8); // key length size 1
            buffer.write(message.command.key, 9);
            logInfo('tunnel', `send #${messageId} static-content:reload ${message.command.key}`);
        } else if (message.command.kind == 'app-server:reload') {
            buffer = Buffer.alloc(9 + message.command.name.length);
            buffer.write('NIRA', 0); // magic size 4
            buffer.writeUInt16LE(messageId, 4); // packet id size 2
            buffer.writeUInt8(4, 6); // kind size 1
            buffer.writeUInt8(2, 7); // command kind size 1
            buffer.writeUInt8(message.command.name.length, 8); // name length size 1
            buffer.write(message.command.name, 9);
            logInfo('tunnel', `send #${messageId} app:reload-server ${message.command.name}`);
        }
    } else if (message.kind == 'reload-browser') {
        buffer = Buffer.alloc(7);
        buffer.write('NIRA', 0); // magic size 4
        buffer.writeUInt16LE(messageId, 4); // packet id size 2
        buffer.writeUInt8(3, 6); // kind size 1
        logInfo('tunnel', `send #${messageId} reload-browser`);
    }

    ecx.connection.send(buffer);
    let timeout: any;
    const received = new Promise<BuildScriptMessageResponse>(resolve => {
        ecx.wakers[messageId] = response => {
            if (timeout) { clearTimeout(timeout); }
            if (message.kind == 'upload' && response.kind == 'upload') {
                response.path = message.path;
                logInfo('tunnel', `ack #${messageId} upload ${message.path} status ${response.status}`);
            } else if (message.kind == 'download' && response.kind == 'download') {
                response.path = message.path;
                logInfo('tunnel', `ack #${messageId} download ${message.path} compress size ${response.content.length}`);
            } else if (message.kind == 'admin' && response.kind == 'admin') {
                response.command = message.command;
                logInfo('tunnel', `ack #${messageId} admin response ${response.ok ? 'ok' : 'not ok'}`);
            } else if (message.kind == 'reload-browser' && response.kind == 'reload-browser') {
                logInfo('tunnel', `ack #${messageId} reload-browser`);
            }
            resolve(response);
        };
    });

    return await Promise.any([
        received,
        new Promise<BuildScriptMessageResponse>(resolve => {
            timeout = setTimeout(() => {
                delete ecx.wakers[messageId];
                logError('tunnel', `message ${messageId} timeout`);
                resolve(null);
            }, 30_000);
        }),
    ]);
}

// upload through websocket connection eliminate the time to establish tls connection and ssh connection
// this also have centralized handling of example.com replacement
// return item is null for not ok
export async function deployWithRemoteConnect(ecx: MessengerContext, assets: UploadAsset[]): Promise<BuildScriptMessageResponseUploadFile[]> {
    // compare to the not know whether can parallel sftp, this is designed to be parallel
    return await Promise.all(assets.map(async asset => {
        // webroot base path and parent path mkdir is handled in remote akari
        if (!Buffer.isBuffer(asset.data)) {
            asset.data = Buffer.from(asset.data.replaceAll('example.com', scriptconfig.domain));
        }
        const data = await new Promise<Buffer>(resolve => zstdCompress(asset.data, (error, data) => {
            if (error) {
                logError('messenger-upload', `failed to compress ${asset.remote}`, error);
                resolve(null);
            } else {
                resolve(data);
            }
        }));
        if (data) {
            return await sendRemoteMessage(ecx, { kind: 'upload', path: asset.remote, content: data });
        } else {
            return null;
        }
    }));
}

// return file path => file content
export async function downloadWithRemoteConnection(ecx: MessengerContext, filepaths: string[]): Promise<Buffer[]> {
    return await Promise.all(filepaths.map(async filepath => {
        const response = await sendRemoteMessage(ecx, { kind: 'download', path: filepath });
        return response.content.length == 0 ? response.content : await new Promise<Buffer>(resolve => zstdDecompress(
            response.content,
            (error, decompressedContent) => {
                if (error) {
                    logError('messenger-download', `download content decompress error`, error);
                    resolve(null);
                } else {
                    resolve(decompressedContent);
                }
            },
        ));
    }));
}
