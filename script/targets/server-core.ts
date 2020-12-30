
import * as fs from 'fs';
import * as chalk from 'chalk';
import { logInfo, logCritical } from '../common';
import { TypeScriptOptions, typescript } from '../tools/typescript';
import { MyPackOptions, MyPackResult, mypack } from '../tools/mypack';
import { Asset, upload } from '../tools/ssh';

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

    logInfo('mka', chalk`{cyan server-core} completed successfully`);
}

function buildWatch() {
    logInfo('mka', chalk`watch {cyan server-core}`);
    fs.mkdirSync('dist/main', { recursive: true });

    const packer = mypack(getMyPackOptions(null));
    typescript(getTypescriptOptions(true)).watch(async ({ files }) => {
        packer.options.files = files;
        const packResult = await packer.run();
        if (packResult.success && packResult.hasChange) {
            await upload(getUploadAssets(packResult));
        }
    });
}

export function build(watch: boolean) {
    (watch ? buildWatch : buildOnce)();
}
