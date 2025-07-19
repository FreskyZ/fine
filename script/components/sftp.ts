import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk-template';
import chalkNoTemplate from 'chalk';
import SFTPClient from 'ssh2-sftp-client';
import { type BuildScriptConfig, logError, logInfo } from './logger';

interface UploadAsset {
    data: Buffer,
    remote: string, // relative path to webroot
}

// return false for not ok
export async function upload(config: BuildScriptConfig, assets: UploadAsset[]): Promise<boolean> {
    const client = new SFTPClient();
    try {
        await client.connect({
            host: config.domain,
            username: config.ssh.user,
            privateKey: await fs.readFile(config.ssh.identity),
            passphrase: config.ssh.passphrase,
        });
        for (const asset of assets) {
            await client.put(asset.data, path.join(config.webroot, asset.remote));
        }
        logInfo('ssh', chalk`upload {yellow ${assets.length}} files ${assets.map(a => chalkNoTemplate.yellow(path.basename(a.remote)))}`);
        return true;
    } catch (error) {
        logError('sftp', 'failed to upload', error);
        return false;
    } finally {
        await client.end();
    }
}
