import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import https from 'node:https';
import net from 'node:net';
import readline from 'node:readline/promises';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import { WebSocketServer } from 'ws';

dayjs.extend(utc);
const config = JSON.parse(await fs.readFile('config', 'utf-8'));

function generateRandomText(length) {
    return crypto.randomBytes(Math.ceil(length * 3 / 4)).toString('base64').slice(0, length);
}
const websocketServer = new WebSocketServer({ noServer: true });
const httpServer = https.createServer({
    key: await fs.readFile(Object.values(config.certificates)[0].key),
    cert: await fs.readFile(Object.values(config.certificates)[0].cert),
});

const readlineInterface = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});
// does all console.log need to be transformed into this?
function logInfo(...parameters) { console.log(...parameters); readlineInterface.prompt(); }
// copied from content.ts
class RateLimit {
    buckets = {};
    constructor(maxCount, refillRate) {
        this.maxCount = maxCount;
        this.refillRate = refillRate;
    }
    /**
     * @param {import('http').IncomingMessage} request
     * @param {import('http').ServerResponse} response
    */
    request(request, response) {
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
const ratelimit = new RateLimit(10, 1);
httpServer.on('request', (request, response) => {
    if (!ratelimit.request(request, response)) { return; }
    const url = new URL(request.url, 'https://example.com');
    if (request.method == 'POST' && url.pathname == '/local-build-complete') {
        logInfo('http/local-build-complete: request received');
        const chunks = [];
        request.on('data', chunk => chunks.push(chunk));
        request.on('end', () => {
            const body = Buffer.concat(chunks).toString();
            logInfo('http/local-build-complete: request body received', body);
            let data;
            try {
                data = JSON.parse(body);
            } catch {
                logInfo('http/local-build-complete: but failed to parse json');
                buildScriptHttpConnectionInputPromiseResolve?.({ ok: false });
            }
            buildScriptHttpConnectionInputPromiseResolve?.(data);
            response.writeHead(200, 'OK');
            response.end();
        });
    } else if (request.method == 'GET' && url.pathname == '/client-dev.js') {
        response.writeHead(200, 'OK');
        response.end(`const w=new WebSocket(\`wss://${Object.keys(config.certificates)[0]}:8001/for-client\`);w.onmessage=e=>{if(e.data=='reload'){location.reload();}};`);
    } else {
        response.writeHead(400, 'Bad Request');
        response.end();
    }
});

let /** @type {WebSocket[]} */ clientWebsocketConnections = [];
let /** @type {WebSocket} */ buildScriptWebsocketConnection;
httpServer.on('upgrade', (request, socket, header) => {
    const url = new URL(request.url, 'https://example.com');
    if (url.pathname != '/for-build' && url.pathname != '/for-client') {
        logInfo('websocket: upgrade request rejected because invalid path, when will this happen?');
        socket.write('HTTP 1.1 400 Bad Request\r\n\r\n');
        socket.destroy();
    } else {
        // logInfo(`websocket: upgrading ${url.pathname}`);
        websocketServer.handleUpgrade(request, socket, header, websocket => {
            if (url.pathname == '/for-build') {
                const token = generateRandomText(6);
                if (buildScriptWebsocketConnection) {
                    logInfo(`websocket${url.pathname}: received another connection, reject`);
                    websocket.close();
                    return;
                }
                logInfo(`websocket${url.pathname}: authenticating, send ${token} at other side`);
                const timeout = setTimeout(() => {
                    logInfo(`websocket${url.pathname}: authentication timeout`);
                    websocket.close();
                }, 15_000);
                websocket.on('message', buffer => {
                    if (buffer.toString('utf-8') == token) {
                        clearTimeout(timeout);
                        logInfo(`websocket${url.pathname}: authenticated`);
                        buildScriptWebsocketConnection = websocket;
                        websocket.on('close', () => {
                            logInfo(`websocket${url.pathname}: disconnected`);
                            buildScriptWebsocketConnection = null;
                            buildScriptHttpConnectionInputPromiseResolve?.({ ok: false });
                        });
                    } else {
                        logInfo(`websocket${url.pathname}: received unexpected message`, buffer);
                        websocket.close();
                    }
                });
            } else {
                logInfo(`websocket${url.pathname}: connected`);
                websocket.on('close', () => {
                    logInfo(`websocket${url.pathname}: disconnected`);
                    const index = clientWebsocketConnections.indexOf(websocket);
                    if (index) { clientWebsocketConnections.splice(index, 1); }
                });
                clientWebsocketConnections.push(websocket);
            }
        });
    }
});
httpServer.listen(8001, () => 'http and websocket: listening 8001');

async function shutdown() {
    logInfo('closing');
    // websocket.close have no close callback, lazy to wait on close event
    buildScriptWebsocketConnection?.close();
    clientWebsocketConnections.forEach(c => c.close());
    // timeout close
    setTimeout(() => { logInfo('close timeout, abort'); process.exit(); }, 10_000);
    await new Promise(resolve => httpServer.close(() => resolve()));
    process.exit(0);
}

let coreAdminInterfaceConnection = net.connect('/tmp/fine.socket');
logInfo(`core socket: connected`);
async function sendCommandToCore(command) {
    return new Promise(resolve => {
        if (!coreAdminInterfaceConnection || coreAdminInterfaceConnection.destroyed) {
            logInfo(`core socket: reconnecting`);
            coreAdminInterfaceConnection = net.connect('/tmp/fine.socket');
            logInfo(`core socket: connected`);
        }
        coreAdminInterfaceConnection.removeAllListeners();
        const serializedCommand = JSON.stringify(command);
        coreAdminInterfaceConnection.on('error', error => {
            coreAdminInterfaceConnection = null;
            logInfo('core socket: error: ', error);
            resolve();
        });
        coreAdminInterfaceConnection.on('timeout', () => {
            logInfo('core socket: timeout, abort connection');
            coreAdminInterfaceConnection.destroy(); // close is not auto called after this event
            coreAdminInterfaceConnection = null;
            resolve();
        });
        coreAdminInterfaceConnection.once('data', data => {
            logInfo('core socket: received', data.toString('utf-8'));
            resolve();
        });
        coreAdminInterfaceConnection.write(serializedCommand);
    });
}

let /** @type {() => void} */ userInputPromiseResolve;
let /** @type {(data: { ok: boolean }) => void} */ buildScriptHttpConnectionInputPromiseResolve;
let /** @type {Promise} */ readlineResumePromise;
async function runWorkflow() {
    while (true) {
        let readlineResumePromiseResolve;
        readlineResumePromise = new Promise(resolve => readlineResumePromiseResolve = resolve);
        const rawCommand = await new Promise(resolve => userInputPromiseResolve = resolve);
        userInputPromiseResolve = null;

        if (rawCommand.length == 0) {
            readlineResumePromiseResolve();
        } else if (rawCommand == 'exit') {
            shutdown();
        } else if (rawCommand.startsWith('!')) {
            const shellCommand = rawCommand.slice(1);
            const child = spawn(shellCommand, { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
            child.stdout.on('data', data => process.stdout.write(data));
            child.stderr.on('data', data => process.stderr.write(data));
            child.on('close', code => {
                logInfo(`workflow: shell command process exited with code ${code}`);
                readlineResumePromiseResolve();
            });
            child.on('error', err => {
                console.error('workflow: failed to start shell command:', err);
                readlineResumePromiseResolve();
            });
        } else if (rawCommand == 'core') {
            // TODO handle websocket disconnect in the process
            // expect the other side is build-core.js
            if (!buildScriptWebsocketConnection) {
                logInfo('workflow: not connected to local build script, nothing to do');
            } else {
                buildScriptWebsocketConnection.send('1');
                const timeout = setTimeout(() => {
                    logInfo('workflow: build script timeout, what happened?');
                    buildScriptHttpConnectionInputPromiseResolve?.({ ok: false });
                }, 60_000);
                const localBuildResult = await new Promise(resolve => buildScriptHttpConnectionInputPromiseResolve = resolve);
                clearTimeout(timeout);
                buildScriptHttpConnectionInputPromiseResolve = null;
                if (!localBuildResult.ok) { logInfo('workflow: local build result seems not ok, abort'); readlineResumePromiseResolve(); continue; }
                logInfo('workflow: build core complete, for now you need to manually restart that');
                readlineResumePromiseResolve();
            }
        } else if (rawCommand == 'user') {
            // expect the other side is build-user.js
            if (!buildScriptWebsocketConnection) {
                logInfo('workflow: not connected to local build script, nothing to do');
            } else {
                buildScriptWebsocketConnection.send('1');
                const timeout = setTimeout(() => {
                    logInfo('workflow: build script timeout, what happened?');
                    buildScriptHttpConnectionInputPromiseResolve?.({ ok: false });
                }, 60_000);
                const localBuildResult = await new Promise(resolve => buildScriptHttpConnectionInputPromiseResolve = resolve);
                clearTimeout(timeout);
                buildScriptHttpConnectionInputPromiseResolve = null;
                if (!localBuildResult.ok) { logInfo('workflow: local build result seems not ok, abort'); readlineResumePromiseResolve(); continue; }
                logInfo('workflow: received local build complete');
                await sendCommandToCore({ kind: 'static-content:reload', key: 'user' });
                readlineResumePromiseResolve();
            }
        } else if (rawCommand.startsWith('yala')) {
            // expect the other side is theai/build.js
            if (!buildScriptWebsocketConnection) {
                logInfo('workflow: not connected to local build script, nothing to do');
            } else {
                buildScriptWebsocketConnection.send('1');
                const timeout = setTimeout(() => {
                    logInfo('workflow: build script timeout, what happened?');
                    buildScriptHttpConnectionInputPromiseResolve?.({ ok: false });
                }, 60_000);
                const localBuildResult = await new Promise(resolve => buildScriptHttpConnectionInputPromiseResolve = resolve);
                clearTimeout(timeout);
                buildScriptHttpConnectionInputPromiseResolve = null;
                if (!localBuildResult.ok) { logInfo('workflow: local build result seems not ok, abort'); readlineResumePromiseResolve(); continue; }
                logInfo('workflow: received local build complete');
                if (rawCommand.includes('client')) {
                    await sendCommandToCore({ kind: 'app:reload-client', name: 'yala' });
                } else if (rawCommand.includes('server')) {
                    await sendCommandToCore({ kind: 'app:reload-server', name: 'yala' });
                } else {
                    // ATTENTION not promise.all, or else the 2 packets
                    // appear in same data event and you need additional mechanism to split them
                    await sendCommandToCore({ kind: 'app:reload-client', name: 'yala' });
                    await sendCommandToCore({ kind: 'app:reload-server', name: 'yala' });
                }
                // disable if includes no reload page, or only include server
                if (!rawCommand.includes('no reload page') && (rawCommand.includes('client') || !rawCommand.includes('server'))) {
                    clientWebsocketConnections.forEach(c => c.send('reload'));
                    logInfo(`workflow: reload request send to client side`);
                }
                readlineResumePromiseResolve();
            }
        } else if (rawCommand == 'reload config') {
            await sendCommandToCore({ kind: 'static-content:reload-config' });
            readlineResumePromiseResolve();
        } else if (rawCommand == 'display application sessions') {
            await sendCommandToCore({ kind: 'access-control:display-application-sessions' });
            readlineResumePromiseResolve();
        } else if (rawCommand == 'display rate limits') {
            await sendCommandToCore({ kind: 'access-control:display-rate-limits' });
            readlineResumePromiseResolve();
        } else {
            logInfo(`workflow: unknown command ${rawCommand}`);
            readlineResumePromiseResolve();
        }
    }
}

readlineInterface.on('SIGINT', () => {
    shutdown();
});
/* ATTENTION no await */ runWorkflow();
readlineInterface.prompt();
for await (const raw of readlineInterface) {
    if (!userInputPromiseResolve) {
        console.log('nothing listening command line input, try again');
        readlineInterface.prompt();
    } else {
        userInputPromiseResolve(raw.trim());
        await readlineResumePromise;
        readlineInterface.prompt();
    }
}
