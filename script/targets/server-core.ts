
import * as fs from 'fs';
import * as chalk from 'chalk';
import { logInfo, logCritical } from '../common';
import { admin } from '../tools/admin';
import { Asset, upload } from '../tools/ssh';
import { TypeScriptOptions, typescript } from '../tools/typescript';
import { MyPackOptions, MyPackResult, mypack } from '../tools/mypack';

const getTypescriptOptions = (watch: boolean): TypeScriptOptions => ({
    base: 'normal',
    entry: 'src/server-core/index.ts',
    sourceMap: 'hide',
    watch,
});

const getMyPackOptions = (files: MyPackOptions['files']): MyPackOptions => ({
    type: 'app',
    files,
    entry: '/vbuild/server-core/index.js',
    sourceMap: true,
    output: 'dist/main/server.js',
    writeFile: false,
    printModules: true,
    minify: true,
});

const getUploadAssets = (packResult: MyPackResult): Asset[] => [
    { name: 'server.js', data: packResult.resultJs, remote: 'WEBROOT/main/server.js' },
    { name: 'server.js.map', data: packResult.resultMap, remote: 'WEBROOT/main/server.js.map' },
];

async function buildOnce(): Promise<void> {
    logInfo('akr', chalk`{cyan server-core}`);
    await fs.promises.mkdir('dist/main', { recursive: true });

    const checkResult = typescript(getTypescriptOptions(false)).check();
    if (!checkResult.success) {
        return logCritical('akr', chalk`{cyan server-core} failed at check`);
    }

    const packResult = await mypack(getMyPackOptions(checkResult.files)).run();
    if (!packResult.success) {
        return logCritical('akr', chalk`{cyan server-core} failed at pack`);
    }

    const uploadResult = await upload(getUploadAssets(packResult));
    if (!uploadResult) {
        return logCritical('akr', chalk`{cyan server-core} failed at upload`);
    }

    logInfo('akr', chalk`{cyan server-core} completed successfully`);
}

async function buildWatch() {
    logInfo('akr', chalk`watch {cyan server-core}`);
    fs.mkdirSync('dist/main', { recursive: true });

    const packer = mypack(getMyPackOptions(null));
    typescript(getTypescriptOptions(true)).watch(async ({ files }) => {
        packer.options.files = files;
        const packResult = await packer.run();
        if (packResult.success && packResult.hasChange) {
            await upload(getUploadAssets(packResult));
            admin({ type: 'watchsc', data: 'start' }); // will be restart if started
        }
    });
    process.on('SIGINT', () => { admin({ type: 'watchsc', data: 'stop' }).then(() => process.exit()); });
}

export function build(watch: boolean) {
    (watch ? buildWatch : buildOnce)();
}
