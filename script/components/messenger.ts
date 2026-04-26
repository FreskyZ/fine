import type { Interface } from 'node:readline/promises';
import { zstdCompress, zstdDecompress } from 'node:zlib';
import { scriptconfig, logInfo, logError } from './common.ts';
import type { MyPackContext } from './mypack.ts';

// messenger: message sender abbreviated as messenger

// use this to avoid global variables because currently no other major global variables used
interface MessengerContext {
    readline: Interface,
    connection?: WebSocket,
    // id to waker (the promise resolver)
    wakers?: Record<number, (data: BuildScriptMessageResponse) => void>,
    nextMessageId?: number,
    // store last mcx for report
    lastmcxStorage?: Record<string, MyPackContext>,
}

/* eslint-disable @stylistic/operator-linebreak -- false positive for type X =\n| Variant1\n| Variant2 */
// BEGIN SHARED TYPE BuildScriptMessage
export interface HasId {
    id: number,
}

// local to remote packet format
// - magic: b'NIRA', packet id: u16le, kind: u8
// - kind: 1 (upload), path length: u8, path: not zero terminated,
//                     compressed flag: u8 (0 not compressed, 1 compressed), content length: u32le, content
// - kind: 2 (download), path length: u8, path: not zero terminated
// - kind: 3 (admin), command kind: u8
//   - command kind: 1 (static-content:reload), key length: u8, key: not zero terminated
//   - command kind: 2 (external-content:reload), name length: u8, name: not zero terminated
//   - command kind: 3 (application-server:reload), name length: u8, name: not zero terminated
// - kind: 4 (reload-browser)
interface BuildScriptMessageUploadFile {
    kind: 'upload',
    path: string,
    content: Buffer, // this maybe compressed
    compressed: boolean,
    // by the way, if you change upload and download file
    // and something broke, you have to go back to sftp upload and docker cp to fix that
}
interface BuildScriptMessageDownloadFile {
    kind: 'download',
    path: string,
}
interface BuildScriptMessageAdminInterfaceCommand {
    kind: 'admin',
    command:
        // remote-akari knows AdminInterfaceCommand type, local akari don't
        // explicitly write these kinds also explicitly limit local admin command kinds, which is ok
        | { kind: 'static-content:reload', key: string }
        | { kind: 'external-content:reload', name: string }
        | { kind: 'application-server:reload', name: string },
}
interface BuildScriptMessageReloadBrowser {
    kind: 'reload-browser',
}
type BuildScriptMessage =
    | BuildScriptMessageUploadFile
    | BuildScriptMessageDownloadFile
    | BuildScriptMessageAdminInterfaceCommand
    | BuildScriptMessageReloadBrowser;

// remote to local packet format
// - magic: b'NIRA', packet id: u16le, kind: u8
// - kind: 1 (upload), status: u8 (1: ok, 2: error, 3: nodiff)
// - kind: 2 (download), compressed flag: u8 (0 not compressed, 1 compressed),
//                       content length: u32le (maybe 0 for error or empty), content
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
    // this maybe compressed
    // empty means error or empty
    // error message is not in returned data but displayed here
    content: Buffer,
    compressed: boolean,
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
        | 'download-content-flag'
        | 'download-content-length'
        | 'download-content'
        | 'admin-command-status' = 'magic';
    private packetId: number;
    private packetKind: number;
    private downloadContentFlag: boolean;
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
                    this.state = 'download-content-flag';
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
            } else if (this.state == 'download-content-flag') {
                if (!this.hasEnoughLength(1)) { return null; }
                this.downloadContentFlag = this.chunk.readUInt8(this.position) != 0;
                this.position += 1;
                if (DebugBuildScriptMessageParser) { logInfo('parser', `state = ${this.state}, kind = download, compressed flag ${this.downloadContentFlag}`); }
                this.state = 'download-content-length';
            } else if (this.state == 'download-content-length') {
                if (!this.hasEnoughLength(4)) { return null; }
                this.downloadContentLength = this.chunk.readUInt32LE(this.position);
                this.position += 4;
                if (DebugBuildScriptMessageParser) { logInfo('parser', `state = ${this.state}, kind = download, content length ${this.downloadContentLength}`); }
                this.state = 'download-content';
            } else if (this.state == 'download-content') {
                if (!this.hasEnoughLength(this.downloadContentLength)) { return null; }
                const content = this.chunk.subarray(this.position, this.position + this.downloadContentLength);
                this.position += this.downloadContentLength;
                if (DebugBuildScriptMessageParser) { logInfo('parser', `state = ${this.state}, kind = download, content full filled`); }
                this.reset();
                return { id: this.packetId, kind: 'download', content, compressed: this.downloadContentFlag };
            } else if (this.state == 'admin-command-status') {
                if (!this.hasEnoughLength(1)) { return null; }
                const commandStatus = this.chunk.readUInt8(this.position);
                const commandStatusOk = commandStatus == 1;
                this.position += 1;
                if (DebugBuildScriptMessageParser) { logInfo('parser', `state = ${this.state}, kind = admin, status ${commandStatus} (${commandStatusOk})`); }
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
    ecx.wakers ??= {};

    return new Promise<boolean>(resolve => {
        const websocket = new WebSocket(`wss://${scriptconfig.domain}:8001`, 'akari');

        websocket.addEventListener('open', async () => {
            logInfo('tunnel', `connected, you'd better complete authentication quickly`);
            let token: string;
            try { token = await ecx.readline.question('> ', { signal: AbortSignal.timeout(20_000) }); }
            catch { logError('tunnel', 'input timeout, cancel connection'); return; }
            websocket.send(token);
        });
        // the close event may not be called after error event is called
        // but normally will, use this to avoid duplicate invocation of reconnect
        // https://stackoverflow.com/questions/38181156/websockets-is-an-error-event-always-followed-by-a-close-event
        // note this if you want to implement auto reconnect again
        websocket.addEventListener('close', async () => {
            logInfo('tunnel', `websocket close`);
            ecx.connection = null;
            resolve(false); // if already invoked resolve(true) in authenticated, this resolve false do nothing
        });
        // this event have error parameter, but that does not have any meaningful property, so omit
        websocket.addEventListener('error', async () => {
            logError('tunnel', `websocket error`);
            ecx.connection = null;
            resolve(false); // if already invoked resolve(true) in authenticated, this resolve false do nothing
        });

        websocket.addEventListener('message', async event => {
            if (event.data == 'authenticated') {
                ecx.connection = websocket;
                logInfo('tunnel', 'websocket received authenticated');
                resolve(true); // this resolve should be most normal case
            } else {
                // logInfo('tunnel', 'websocket received', event.data);
                const buffers = Array.isArray(event.data) ? event.data
                    : Buffer.isBuffer(event.data) ? [event.data]
                    : event.data instanceof Blob ? [Buffer.from(await event.data.arrayBuffer())]
                    : [Buffer.from(event.data)];
                for (const buffer of buffers) {
                    logInfo(`tunnel`, `receive raw data ${buffer.length} bytes`);
                    buildScriptMessageResponseParser.push(buffer);
                    // one push may result in multiple packets
                    while (true) {
                        const response = buildScriptMessageResponseParser.pull();
                        if (!response) { break; }
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

    ecx.wakers ??= {};
    ecx.nextMessageId ??= 1;

    const messageId = ecx.nextMessageId;
    ecx.nextMessageId += 1;

    let buffer: Buffer<ArrayBuffer>;
    if (message.kind == 'upload') {
        buffer = Buffer.alloc(13 + message.path.length + message.content.length);
        buffer.write('NIRA', 0); // magic size 4
        buffer.writeUInt16LE(messageId, 4); // packet id size 2
        buffer.writeUInt8(1, 6); // kind size 1
        buffer.writeUInt8(message.path.length, 7); // path length size 1
        buffer.write(message.path, 8);
        buffer.writeUInt8(message.compressed ? 1 : 0, message.path.length + 8); // compressed flag size 1
        buffer.writeUInt32LE(message.content.length, message.path.length + 9); // content length size 4
        message.content.copy(buffer, 13 + message.path.length, 0);
        logInfo('tunnel', `send #${messageId} upload ${message.path} ${message.compressed ? 'compressed ' : ''}size ${message.content.length} bytes`);
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
        } else if (message.command.kind == 'external-content:reload') {
            buffer = Buffer.alloc(9 + message.command.name.length);
            buffer.write('NIRA', 0); // magic size 4
            buffer.writeUInt16LE(messageId, 4); // packet id size 2
            buffer.writeUInt8(3, 6); // kind size 1
            buffer.writeUInt8(2, 7); // command kind size 1
            buffer.writeUInt8(message.command.name.length, 8); // name length size 1
            buffer.write(message.command.name, 9);
            logInfo('tunnel', `send #${messageId} external-content:reload ${message.command.name}`);
        } else if (message.command.kind == 'application-server:reload') {
            buffer = Buffer.alloc(9 + message.command.name.length);
            buffer.write('NIRA', 0); // magic size 4
            buffer.writeUInt16LE(messageId, 4); // packet id size 2
            buffer.writeUInt8(3, 6); // kind size 1
            buffer.writeUInt8(3, 7); // command kind size 1
            buffer.writeUInt8(message.command.name.length, 8); // name length size 1
            buffer.write(message.command.name, 9);
            logInfo('tunnel', `send #${messageId} application-server:reload ${message.command.name}`);
        }
    } else if (message.kind == 'reload-browser') {
        buffer = Buffer.alloc(7);
        buffer.write('NIRA', 0); // magic size 4
        buffer.writeUInt16LE(messageId, 4); // packet id size 2
        buffer.writeUInt8(4, 6); // kind size 1
        logInfo('tunnel', `send #${messageId} reload-browser`);
    }

    ecx.connection.send(buffer);
    let timeout: any;
    const received = new Promise<BuildScriptMessageResponse>(resolve => {
        ecx.wakers[messageId] = response => {
            if (timeout) { clearTimeout(timeout); }
            if (message.kind == 'upload' && response.kind == 'upload') {
                response.path = message.path;
                logInfo('tunnel', `receive #${messageId} upload ${message.path} status ${response.status}`);
            } else if (message.kind == 'download' && response.kind == 'download') {
                response.path = message.path;
                logInfo('tunnel', `receive #${messageId} download ${message.path} size ${response.content.length}`);
            } else if (message.kind == 'admin' && response.kind == 'admin') {
                response.command = message.command;
                logInfo('tunnel', `receive #${messageId} admin response ${response.ok ? 'ok' : 'not ok'}`);
            } else if (message.kind == 'reload-browser' && response.kind == 'reload-browser') {
                logInfo('tunnel', `receive #${messageId} reload-browser`);
            }
            resolve(response);
        };
    });

    return await Promise.race([
        received,
        new Promise<BuildScriptMessageResponse>(resolve => {
            timeout = setTimeout(() => {
                delete ecx.wakers[messageId];
                logError('tunnel', `message #${messageId} timeout`);
                resolve(null);
            }, 30_000);
        }),
    ]);
}

export interface UploadAsset {
    data: string | Buffer,
    // remote path, if this path ends with .tar.xz or .tar.gz, the file will not be compressed
    remote: string,
}
// upload through websocket connection eliminate the time to establish tls connection and ssh connection
// this also have centralized handling of example.com replacement
// return item is null for not ok
export async function uploadWithRemoteConnection(ecx: MessengerContext, assets: UploadAsset[]): Promise<BuildScriptMessageResponseUploadFile[]> {
    // compare to the old ssh2-sftp-client package or sftp protocol (this is gone for now), this is designed to be parallel
    return await Promise.all(assets.map(async asset => {
        if (!asset.data) { return null; }
        // webroot base path and parent path mkdir is handled in remote akari
        if (!Buffer.isBuffer(asset.data)) {
            asset.data = Buffer.from(asset.data.replaceAll('example.com', scriptconfig.domain));
        }
        if (asset.data.length < 1024 || ['.tar.xz', '.tar.gz'].some(ext => asset.remote.endsWith(ext))) {
            return await sendRemoteMessage(ecx, { kind: 'upload', path: asset.remote, content: asset.data, compressed: false });
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
            return await sendRemoteMessage(ecx, { kind: 'upload', path: asset.remote, content: data, compressed: true });
        } else {
            return null;
        }
    }));
}

// return matching file content, null for not ok
export async function downloadWithRemoteConnection(ecx: MessengerContext, filepaths: string[]): Promise<Buffer[]> {
    return await Promise.all(filepaths.map(async filepath => {
        const response = await sendRemoteMessage(ecx, { kind: 'download', path: filepath });
        return !response.compressed ? response.content : await new Promise<Buffer>(resolve => zstdDecompress(
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
