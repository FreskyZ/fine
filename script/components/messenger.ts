import fs from 'node:fs/promises';
import type { Interface } from 'node:readline/promises';
import tls from 'node:tls';
import { zstdCompress } from 'node:zlib';
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
                logInfo('tunnel', 'websocket received', event.data);
                try {
                    const response = JSON.parse(event.data);
                    if (!response.id) {
                        logError('tunnel', `received response without id, when will this happen?`);
                    } else if (!(response.id in ecx.wakers)) {
                        logError('tunnel', `no waker found for received response, when will this happen?`);
                    } else {
                        ecx.wakers[response.id](response);
                        delete ecx.wakers[response.id];
                    }
                } catch (error) {
                    logError('tunnel', `received data failed to parse json`, error);
                }
            }
        });
    });
}

/* eslint-disable @stylistic/operator-linebreak -- false positive for type X =\n| Variant1\n| Variant2 */
// BEGIN SHARED TYPE BuildScriptMessage
export interface HasId {
    id: number,
}

// received packet format
// - magic: NIRA, packet id: u16le, kind: u8
// - kind: 1 (file), file name length: u8, filename: not zero terminated, buffer length: u32le, buffer
// - kind: 2 (admin), command kind: u8
//   - command kind: 1 (static-content:reload), key length: u8, key: not zero terminated
//   - command kind: 2 (app:reload-server), app length: u8, app: not zero terminated
// - kind: 3 (reload-browser)
interface BuildScriptMessageUploadFile {
    kind: 'file',
    filename: string,
    content: Buffer, // this is compressed
}
interface BuildScriptMessageAdminInterfaceCommand {
    kind: 'admin',
    command:
        // remote-akari knows AdminInterfaceCommand type, local akari don't
        // this also explicitly limit local admin command range, which is ok
        | { kind: 'static-content:reload', key: string }
        | { kind: 'app:reload-server', name: string },
}
interface BuildScriptMessageReloadBrowser {
    kind: 'reload-browser',
}
type BuildScriptMessage =
    | BuildScriptMessageUploadFile
    | BuildScriptMessageAdminInterfaceCommand
    | BuildScriptMessageReloadBrowser;

// response packet format
// - magic: NIRA, packet id: u16le, kind: u8
// - kind: 1 (file), status: u8
// - kind: 2 (admin)
// - kind: 3 (reload-browser)
interface BuildScriptMessageResponseUploadFile {
    kind: 'file',
    // filename path is not in returned data but assigned at local side
    filename?: string,
    // no error message in response, it is displayed here
    status: 'ok' | 'error' | 'nodiff',
}
interface BuildScriptMessageResponseAdminInterfaceCommand {
    kind: 'admin',
    // command is not in returned data but assigned at local side
    command?: BuildScriptMessageAdminInterfaceCommand['command'],
    // response is not in returned data but displayed here
}
interface BuildScriptMessageResponseReloadBrowser {
    kind: 'reload-browser',
}
type BuildScriptMessageResponse =
    | BuildScriptMessageResponseUploadFile
    | BuildScriptMessageResponseAdminInterfaceCommand
    | BuildScriptMessageResponseReloadBrowser;
// END SHARED TYPE BuildScriptMessage

export async function sendRemoteMessage(ecx: MessengerContext, message: BuildScriptMessageUploadFile): Promise<BuildScriptMessageResponseUploadFile>;
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
    if (message.kind == 'file') {
        buffer = Buffer.alloc(12 + message.filename.length + message.content.length);
        buffer.write('NIRA', 0); // magic size 4
        buffer.writeUInt16LE(messageId, 4); // packet id size 2
        buffer.writeUInt8(1, 6); // kind size 1
        buffer.writeUInt8(message.filename.length, 7); // file name length size 1
        buffer.write(message.filename, 8);
        buffer.writeUInt32LE(message.content.length, message.filename.length + 8); // content length size 4
        message.content.copy(buffer, 12 + message.filename.length, 0);
        logInfo('tunnel', `send #${messageId} file ${message.filename} compress size ${message.content.length}`);
    } else if (message.kind == 'admin') {
        if (message.command.kind == 'static-content:reload') {
            buffer = Buffer.alloc(9 + message.command.key.length);
            buffer.write('NIRA', 0); // magic size 4
            buffer.writeUInt16LE(messageId, 4); // packet id size 2
            buffer.writeUInt8(2, 6); // kind size 1
            buffer.writeUInt8(1, 7); // command kind size 1
            buffer.writeUInt8(message.command.key.length, 8); // key length size 1
            buffer.write(message.command.key, 9);
            logInfo('tunnel', `send #${messageId} static-content:reload ${message.command.key}`);
        } else if (message.command.kind == 'app:reload-server') {
            buffer = Buffer.alloc(9 + message.command.name.length);
            buffer.write('NIRA', 0); // magic size 4
            buffer.writeUInt16LE(messageId, 4); // packet id size 2
            buffer.writeUInt8(2, 6); // kind size 1
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
            if (message.kind == 'file' && response.kind == 'file') {
                response.filename = message.filename;
            } else if (message.kind == 'admin' && response.kind == 'admin') {
                response.command = message.command;
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
            return await sendRemoteMessage(ecx, { kind: 'file', filename: asset.remote, content: data });
        } else {
            return null;
        }
    }));
}
