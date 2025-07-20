import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk-template';
import chalkNotTemplate from 'chalk';
import SFTPClient from 'ssh2-sftp-client';
import { type BuildScriptConfig, logError, logInfo } from './logger.ts';

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
            const fullpath = path.join(config.webroot, asset.remote);
            await client.mkdir(path.dirname(fullpath), true);
            await client.put(asset.data, fullpath);
        }
        logInfo('ssh', chalk`upload {yellow ${assets.length}} files ${assets.map(a => chalkNotTemplate.yellow(path.basename(a.remote)))}`);
        return true;
    } catch (error) {
        logError('sftp', 'failed to upload', error);
        return false;
    } finally {
        await client.end();
    }
}
