import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as chalk from 'chalk';
import * as zlib from 'zlib';
import { logInfo, logCritical } from '../common';
import { config } from '../config';
import { eslint } from '../tools/eslint';
import { Asset, upload } from '../tools/ssh';
import { TypeScriptOptions, typescript } from '../tools/typescript';
import { MyPackOptions, MyPackResult, mypack } from '../tools/mypack';

const entryNames = {
    'local': 'index',
    'server': 'index-server',
    'app': 'index-app',
} as Record<string, string>;

const getTypescriptOptions = (target: string): TypeScriptOptions => ({
    base: 'normal',
    entry: `script/${entryNames[target]}.ts`,
    sourceMap: 'no',
    watch: false,
    configSubstitution: target == 'server',
});
const getMyPackOptions = (target: string, files: MyPackOptions['files']): MyPackOptions => ({
    type: 'app',
    entry: `/vbuild/${entryNames[target]}.js`,
    files,
    minify: true,
    shebang: true,
    cleanupFiles: false,
});

const getUploadAssets = (packResult: MyPackResult): Asset[] => [
    { data: packResult.resultJs, remote: 'akari', mode: 0o777 },
];

async function readdirRecursively(files: string[], directory: string) {
    for (const entry of await fs.promises.readdir(directory, { withFileTypes: true })) {
        const entrypath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            await readdirRecursively(files, entrypath);
        } else {
            files.push(entrypath);
        }
    }
}
export async function hashself(): Promise<string> {

    const files: string[] = [];
    await readdirRecursively(files, "script");
    files.sort();

    // use md5 because no security requirements
    const allhasher = crypto.createHash('md5');
    // no promise.all because hash is not io bound
    for (const file of files) {
        // it is actually required to for-await, to guarantee order
        await new Promise<void>(resolve => {
            const hasher = crypto.createHash('md5');
            const stream = fs.createReadStream(file);
            stream.on('data', data => hasher.update(data));
            stream.on('end', () => { allhasher.update(hasher.digest()); resolve(); });
        });
    }
    return allhasher.digest('hex');
}

export async function build(target: string): Promise<void> {
    logInfo('akr', chalk`{cyan self} ${target}`);
    await eslint('self', 'node', 'script/**/*.ts');

    const checkResult = typescript(getTypescriptOptions(target)).check();
    if (!checkResult.success) {
        return logCritical('akr', chalk`{cyan self} failed at transpile`);
    }

    const packResult = await mypack(getMyPackOptions(target, checkResult.files)).run();
    if (!packResult.success) {
        return logCritical('akr', chalk`{cyan self} failed at pack`);
    }

    if (target == 'local') {
        const resultjs = packResult.resultJs.toString('utf-8').replace('self' + 'hash', await hashself());
        await fs.promises.writeFile('akari', resultjs);
    } else if (target == 'server') {
        const uploadResult = await upload(getUploadAssets(packResult));
        if (!uploadResult) {
            return logCritical('akr', chalk`{cyan self} failed at upload`);
        }
    } else if (target == 'app') {
        const sharedFiles = await fs.promises.readdir('src/shared', { withFileTypes: true });
        const sdkfiles = await Promise.all(sharedFiles.filter(e => e.isFile()).map(async e => {
            const content = await fs.promises.readFile(path.join('src/shared', e.name));
            const compressed = zlib.brotliCompressSync(content);
            const encoded = compressed.toString('base64');
            return [e.name, encoded] as [string, string];
        }));
        const sdkvar = '{' + sdkfiles.map(f => `'${f[0]}':'${f[1]}'`).join(',') + '}';
        const resultjs = packResult.resultJs.toString('utf-8').replace('compressedsdkfiles', sdkvar);

        await Promise.all(config.apps.filter(a => a.devrepo).map(a => {
            logInfo('akr', chalk`copy to {yellow ${a.devrepo}}`);
            return fs.promises.writeFile(path.join(a.devrepo, 'akari'), resultjs);
        }));
    }

    logInfo('akr', chalk`{cyan self} completed successfully`);
}
