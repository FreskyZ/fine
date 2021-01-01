import * as fs from 'fs';
import * as path from 'path';
import * as chalk from 'chalk';
import { logInfo } from '../common';
import { Asset, upload } from '../tools/ssh';

async function collectAssets(assets: Asset[], directory: string) {
    await Promise.all((await fs.promises.readdir(directory, { withFileTypes: true })).map(async entry => {
        const entryName = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            await collectAssets(assets, entryName);
        } else {
            // replace: from 'src/public/*' to 'WEBROOT/public/*'
            assets.push({ remote: entryName.replace('src', 'WEBROOT'), data: await fs.promises.readFile(entryName) });
        }
    }));
    return assets;
}

export async function build(): Promise<void> {
    // mkdir(recursive)
    logInfo('akr', chalk`{cyan public}`);
    await upload(await collectAssets([], 'src/public'));
    logInfo('akr', chalk`{cyan public} complete`);
}
