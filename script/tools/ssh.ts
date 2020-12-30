import * as fs from 'fs';
import * as chalk from 'chalk';
import * as SFTPClient from 'ssh2-sftp-client';
import { logInfo, logError } from '../common';

export interface Asset {
    name: string,   // display name
    data: Buffer,
    remote: string, // should be absolute
    mode?: number,   // default to 0o644
}

export async function upload(assets: Asset[]) {
    const client = new SFTPClient();

    for (const asset of assets) {
        if (!asset.data || !Buffer.isBuffer(asset.data)) { // in case I missed mypack config
            logError('ssh', `${asset.name} invalid data`);
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
        logInfo('ssh', chalk`upload {yellow ${assets.length}} file`);
        return true;
    } catch (ex) {
        logError('ssh', 'error ' + ex.message);
        return false;
    }
}
