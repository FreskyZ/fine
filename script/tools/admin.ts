import * as crypto from 'crypto';
import * as fs from 'fs';
import * as https from 'https';
import * as chalk from 'chalk';
import type { AdminPayload } from '../../src/shared/types/admin';
import { logInfo, logError, logCritical, formatAdminPayload } from '../common';
import { download } from './ssh';

// this is akari (local) to akari (server)

const codebook = fs.readFileSync('CODEBOOK', 'utf-8');

type V = [number, number, number];
let v: V | null = null; // [port, scryptPasswordIndex, scryptSaltIndex]
async function getv(): Promise<V> {
    if (!v) {
        // cannot ssh connect or any error download file or parse content
        // is regarded as critical error and will abort process, because almost all targets need upload file or send command

        const assets = await download('WEBROOT/akariv', true);
        if (!assets) {
            return logCritical('adm', 'cannot connect akari (server) (1)');
        }

        const vs = assets[0].data.toString();
        v = vs.split(':').map(x => parseInt(x)) as V;
        if (v.length != 3 || v.some(x => !x)) {
            return logCritical('adm', 'cannot connect akari (server) (2)');
        }
    }
    return v;
}

// get akari (server) port
export const getServerPort = async (): Promise<number> => (await getv())[0];

export const admin = (payload: AdminPayload, additionalHeader?: string): Promise<boolean> => new Promise(resolve => {
    const logHeader = `adm${additionalHeader ?? ''}`;
    const serialized = JSON.stringify(payload);
    getv().then(v => {
        const key = crypto.scryptSync(codebook.slice(v[1], 32), codebook.slice(v[2], 32), 32);
        const iv = crypto.randomFillSync(new Uint8Array(16));
        const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
        const encryptedChunks: Buffer[] = [];
        cipher.on('data', chunk => encryptedChunks.push(Buffer.from(chunk)));
        cipher.write(serialized);
        cipher.end();
        const encrypted = Buffer.concat(encryptedChunks).toString('hex');
        const packed = Buffer.from(iv).toString('hex') + encrypted;

        // make sure resolve always get called: ref https://nodejs.org/api/http.html#http_http_request_url_options_callback
        // if request.abort() is not called
        //     if most common normal success occassion, request.on('response') is called, then response.on('data') may be called, then response.on('end') is called
        //     else, request.on('error') must be called
        const request = https.request({
            host: 'DOMAIN_NAME',
            method: 'POST',
            port: v[0],
        });
        request.on('error', error => {
            if ((error as any).code == 'ECONNREFUSED') {
                logError(logHeader, 'cannot connect akari (server)');
            } else {
                logError(logHeader, `request error ${error.message}`, error);
            }
            resolve(false);
        });
        request.on('socket', socket => {
            socket.on('error', () => {
                // // currently this reports same error as request.on('error'), while duplicate resolve only respects the first one
                // logError(logHeader, `socket error ${error.message}`);
                resolve(false);
            });
            request.write(packed);
            request.end();
        });
        request.on('response', response => {
            if (response.statusCode != 200) {
                logError(logHeader, `response ${response.statusCode}`);
                resolve(false);
            } else if (payload.type == 'service') {
                response.pipe(process.stdout);
                response.on('end', () => resolve(true));
            } else if (payload.type == 'watchsc') {
                if (payload.data == 'stop') {
                    /* eslint-disable @typescript-eslint/no-empty-function */ // according to document, if you don't receive and ignore data event, end event will not be emitted
                    response.on('data', () => {});
                    /* eslint-enable @typescript-eslint/no-empty-function */
                    response.on('end', () => {
                        logInfo(logHeader, chalk`ack stop watch server-core`);
                        resolve(true);
                    });
                } else if (payload.data == 'start') {
                    let headerReceived = false; // body header, not http header
                    let receivingHeader = Buffer.alloc(0); // in case header is splitted // when will this 4 characters splitted?
                    response.on('data', chunk => {
                        if (!headerReceived) {
                            receivingHeader = Buffer.concat([receivingHeader, Buffer.from(chunk)]);
                            if (receivingHeader.length < 4) {
                                return; // wait next chunk
                            } else {
                                headerReceived = true;
                                const header = receivingHeader.slice(0, 4).toString();
                                if (header == 'that') {
                                    logInfo(logHeader, chalk`ack {yellow restart watch server-core}`);
                                    resolve(true);
                                } else if (header == 'this') {
                                    // write remaining to stdout and start direct pipe
                                    process.stdout.write(receivingHeader.slice(4));
                                    response.pipe(process.stdout);
                                } else {
                                    logError(logHeader, `start watch server-core received unexpected header ${header}`);
                                    resolve(false);
                                }
                            }
                        } else {
                            // header already received and validated and handled, here will not be called or already started piping
                        }
                    });
                    response.on('end', () => resolve(true));
                }
            } else {
                let fulldata = ''; // I don't know when this small response will be splitted, but collect full data in case
                response.on('data', (data: string) => { fulldata += data; });
                response.on('end', () => {
                    if (fulldata == 'ACK ' + serialized) {
                        logInfo(logHeader, chalk`{cyan ACK} {yellow ${formatAdminPayload(payload)}}`);
                        resolve(true);
                    } else {
                        logError(logHeader, 'unexpected response ' + fulldata);
                        resolve(false);
                    }
                });
            }
        });
    });
});
