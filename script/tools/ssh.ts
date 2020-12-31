import * as fs from 'fs';
import * as path from 'path';
import * as stream from 'stream';
import * as chalk from 'chalk';
import * as SFTPClient from 'ssh2-sftp-client';
import { logInfo, logError } from '../common';

export interface Asset {
    data?: Buffer,
    remote: string, // should be absolute
    mode?: number,  // default to 0o644
}

export async function upload(assets: Asset | Asset[], options?: { filenames?: boolean, additionalHeader?: string }) {
    assets = Array.isArray(assets) ? assets : [assets];
    const client = new SFTPClient();

    for (const asset of assets) {
        if (!asset.data || !Buffer.isBuffer(asset.data)) { // in case I missed mypack config
            logError('ssh', `${path.basename(asset.remote)} invalid data`);
            return false;
        }
    }

    try {
        await client.connect({ 
            host: 'DOMAIN_NAME', 
            username: 'SSH_USER', 
            privateKey: await fs.promises.readFile('SSH_KEY'), 
            passphrase: 'SSH_PASSPHRASE',
        });

        for (const asset of assets) {
            await client.put(asset.data, asset.remote, { mode: asset.mode || 0o644 });
        }
        await client.end();
        logInfo(`ssh${options?.additionalHeader ?? ''}`, chalk`upload {yellow ${assets.length}} files ${options?.filenames ? assets.map(a => chalk.yellow(path.basename(a.remote))) : ''}`);
        return true;
    } catch (ex) {
        logError(`ssh${options?.additionalHeader ?? ''}`, 'error ' + ex.message);
        return false;
    }
}

export async function download(assets: Asset[], silence?: boolean) {
    const client = new SFTPClient();

    try {
        await client.connect({ 
            host: 'DOMAIN_NAME', 
            username: 'SSH_USER', 
            privateKey: await fs.promises.readFile('SSH_KEY'), 
            passphrase: 'SSH_PASSPHRASE',
        });

        for (const asset of assets) {
            const chunks: Buffer[] = [];
            await client.get(asset.remote, new stream.Writable({
                write(chunk, encoding, callback) {
                    chunks.push(Buffer.from(chunk, encoding));
                    callback();
                }
            }));
            asset.data = Buffer.concat(chunks);
        }
        await client.end();
        if (!silence) {
            logInfo('ssh', chalk`download {yellow ${assets.length}} file`);
        }
        return true;
    } catch (ex) {
        logError('ssh', 'error ' + ex.message);
        return false;
    }
}
