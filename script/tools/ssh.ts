import fs from 'node:fs';
import path from 'node:path';
import stream from 'node:stream';
import chalk from 'chalk-template';
import SFTPClient from 'ssh2-sftp-client';
import { config } from '../config';
import { logInfo, logError } from '../common';

export interface Asset {
    data: Buffer,
    remote: string, // should be absolute
    mode?: number,  // default to 0o644
}

export interface UploadOptions {
    // base directory, default to config.webroot
    basedir?: string,
    // display files names in message
    filenames?: boolean,
    // additional header for message
    additionalHeader?: string,
}

const sshconnect = {
    host: config.domain,
    username: config.ssh.user,
    privateKey: fs.readFileSync(config.ssh.identity),
    passphrase: config.ssh.passphrase,
};

export async function upload(assets: Asset | Asset[], options?: UploadOptions): Promise<boolean> {
    assets = Array.isArray(assets) ? assets : [assets];
    const client = new SFTPClient();

    for (const asset of assets) {
        if (!asset.data || !Buffer.isBuffer(asset.data)) { // in case I missed mypack config
            logError('ssh', `${path.basename(asset.remote)} invalid data`);
            return false;
        }
    }

    try {
        await client.connect(sshconnect);

        for (const asset of assets) {
            await client.put(asset.data, path.join(options?.basedir ?? config.webroot, asset.remote), { writeStreamOptions: { mode: asset.mode || 0o644 } });
        }
        await client.end();
        logInfo(`ssh${options?.additionalHeader ?? ''}`, chalk`upload {yellow ${assets.length}} files ${!options?.filenames ? assets.map(a => chalk.yellow(path.basename(a.remote))) : ''}`);
        return true;
    } catch (ex) {
        logError(`ssh${options?.additionalHeader ?? ''}`, 'error ' + ex.message);
        return false;
    }
}

export async function download(remoteNames: string | string[], silence?: boolean): Promise<Asset[] | null> {
    remoteNames = Array.isArray(remoteNames) ? remoteNames : [remoteNames];
    const client = new SFTPClient();

    try {
        await client.connect(sshconnect);

        const assets: Asset[] = [];
        for (const remoteName of remoteNames) {
            const chunks: Buffer[] = [];
            await client.get(path.join(config.webroot, remoteName), new stream.Writable({
                write(chunk, encoding, callback) {
                    chunks.push(Buffer.from(chunk, encoding));
                    callback();
                },
            }));
            assets.push({ remote: remoteName, data: Buffer.concat(chunks) });
        }
        await client.end();
        if (!silence) {
            logInfo('ssh', chalk`download {yellow ${assets.length}} file`);
        }
        return assets;
    } catch (ex) {
        logError('ssh', 'error ' + ex.message);
        return null;
    }
}
