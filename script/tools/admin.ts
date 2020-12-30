import * as crypto from 'crypto';
import * as https from 'https';
import * as chalk from 'chalk';
import type { AdminPayload } from '../../src/shared/types/admin';
import { logInfo, logError, logCritical, formatAdminPayload } from '../common';
import { Asset, download } from './ssh';
import { pi } from './pi';

// this is akari (local) to akari (server)

type V = [number, number, number]
let v: V = null; // [port, scryptPasswordIndex, scryptSaltIndex]
async function getv(): Promise<V> {
    if (!v) {
        // cannot ssh connect or any error download file or parse content 
        // is regarded as critical error and will abort process, because almost all targets need upload file or send command

        const asset: Asset = { name: 'akariv', remote: 'WEBROOT/akariv' };
        if (!await download([asset], true)) {
            return logCritical('adm', 'fail to getv (1)');
        }

        const vs = asset.data.toString();
        v = vs.split(':').map(x => parseInt(x)) as V;
        if (v.length != 3 || v.some(x => !x)) {
            return logCritical('adm', 'fail to getv (2)');
        }
    }
    return v;
}

export const admin = (payload: AdminPayload): Promise<boolean> => new Promise(resolve => {
    const serialized = JSON.stringify(payload);
    getv().then(v => {
        const key = crypto.scryptSync(pi.slice(v[1], 32), pi.slice(v[2], 32), 32);
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
            timeout: 15_000,
        });
        request.on('error', error => {
            if ((error as any).code == 'ECONNREFUSED') {
                logError('adm', 'cannot connect akari (server)');
            } else {
                logError('adm', `request error ${error.message}`, error);
            }
            resolve(false);
        });
        request.on('socket', socket => {
            socket.on('error', _error => {
                // // currently this reports same error as request.on('error'), while duplicate resolve only respects the first one
                // logError('adm', `socket error ${error.message}`);
                resolve(false);
            })
            request.write(packed);
            request.end();
        });
        request.on('timeout', () => {
            logError('adm', 'timeout');
            resolve(false);
        });
        request.on('response', response => {
            if (response.statusCode != 200) {
                logError('adm', `response unexpected status ${response.statusCode}`);
                resolve(false);
            } else {
                // I don't know when this small response will be splitted, but collect full data in case
                let fulldata = '';
                response.on('data', (data: string) => { fulldata += data; });

                response.on('end', () => {
                    if (fulldata == 'ACK ' + serialized) {
                        logInfo('adm', chalk`ACK {yellow ${formatAdminPayload(payload)}}`);
                        resolve(true);
                    } else {
                        logError('adm', 'unexpected response ' + fulldata);
                        resolve(false);
                    }
                });
            }
        });
    });
});
