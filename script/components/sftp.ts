import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk-template';
import chalkNotTemplate from 'chalk';
import SFTPClient from 'ssh2-sftp-client';
import { type BuildScriptConfig, logError, logInfo } from './logger.ts';

interface UploadAsset {
    data: string | Buffer,
    remote: string, // relative path to webroot
}

// return false for not ok
// nearly every text file need replace example.com to real domain,
// so change this function to 'deploy' to make it reasonable to do the substitution,
// use buffer or Buffer.from(string) to skip that
export async function deploy(config: BuildScriptConfig, assets: UploadAsset[]): Promise<boolean> {
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
            if (!Buffer.isBuffer(asset.data)) {
                asset.data = Buffer.from(asset.data.replaceAll('example.com', config.domain));
            }
            await client.put(asset.data, fullpath);
        }
        logInfo('sftp', chalk`upload {yellow ${assets.length}} files ${assets.map(a => chalkNotTemplate.yellow(path.basename(a.remote)))}`);
        return true;
    } catch (error) {
        logError('sftp', 'failed to upload', error);
        return false;
    } finally {
        await client.end();
    }
}
