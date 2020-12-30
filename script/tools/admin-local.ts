import * as https from 'https';
import * as chalk from 'chalk';
import type { AdminPayload } from '../../src/shared/types/admin';
import { logInfo, logError, formatAdminPayload } from '../common';

// this is akari (local) to akari (server)

export async function admin(payload: AdminPayload): Promise<boolean> {
    return new Promise(resolve => {
        // make sure resolve always get called:
        // https://nodejs.org/api/http.html#http_http_request_url_options_callback
        // if request.abort() is not called
        //     if most common normal success occassion, request.on('response') is called, then response.on('data') may be called, then response.on('end') is called
        //     else, request.on('error') must be called

        const serialized = JSON.stringify(payload);
        const request = https.request({
            host: 'DOMAIN_NAME',
            method: 'POST',
            port: 8001,
            timeout: 10_000,
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
            request.write(serialized);
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
}
