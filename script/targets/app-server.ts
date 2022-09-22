import * as fs from 'fs';
import * as chalk from 'chalk';
import { config } from '../config';
import { logInfo, logCritical } from '../common';
import { eslint } from '../tools/eslint';
import { codegen, deployADK as deployADKImpl } from '../tools/codegen';
import { Asset, upload } from '../tools/ssh';
import { TypeScriptOptions, typescript } from '../tools/typescript';
import { MyPackOptions, MyPackResult, mypack } from '../tools/mypack';

const getTypeScriptOptions = (watch: boolean): TypeScriptOptions => ({
    base: 'normal',
    entry: `src/core/index.ts`,
    sourceMap: 'normal',
    watch,
});
const getMyPackOptions = (files: MyPackOptions['files']): MyPackOptions => ({
    type: 'app',
    entry: `/vbuild/core/index.js`,
    files,
    sourceMap: true,
    output: `index.js`,
    printModules: true,
    minify: true,
});
const getUploadAssets = (packResult: MyPackResult): Asset[] => [
    { remote: `index.js`, data: packResult.resultJs },
    { remote: `index.js.map`, data: packResult.resultMap! },
];

export async function uploadConfig(): Promise<void> {
    await upload({ remote: 'config', data: await fs.promises.readFile('src/core/config') }, { basedir: config.approot });
}
export async function deployADK() {
    await deployADKImpl();
    logInfo('adk', 'deploy adk');
}

async function buildOnce(): Promise<void> {
    logInfo('akr', chalk`{cyan server}`);
    await eslint(`server`, 'node', [`src/**/*.ts`]);
    // mkdir(recursive)

    const codegenResult = await codegen('server').generate();
    if (!codegenResult.success) {
        return logCritical('akr', chalk`{cyan server} failed at code generation`);
    }

    const checkResult = typescript(getTypeScriptOptions(false)).check();
    if (!checkResult.success) {
        return logCritical('akr', chalk`{cyan server} failed at check`);
    }

    const packResult = await mypack(getMyPackOptions(checkResult.files)).run();
    if (!packResult.success) {
        return logCritical('akr', chalk`{cyan server} failed at pack`);
    }

    const uploadResult = await upload(getUploadAssets(packResult), { basedir: config.approot });
    if (!uploadResult) {
        return logCritical('akr', chalk`{cyan server} failed at upload`);
    }
    // const adminResult = await admin.core({ type: 'auth', sub: { type: 'reload-server', app } });
    // if (!adminResult) {
    //     return logCritical('akr', chalk`{cyan server} failed at reload`);
    // }

    logInfo('akr', chalk`{cyan server} complete successfully`);
}

function buildWatch(additionalHeader?: string) {
    logInfo(`akr${additionalHeader ?? ''}`, chalk`watch {cyan server}`);
    // mkdir(recursive)

    codegen('server', additionalHeader).watch(); // no callback watch is this simple

    const packer = mypack(getMyPackOptions([]), additionalHeader);
    typescript(getTypeScriptOptions(true), additionalHeader).watch(async ({ files }) => {
        packer.updateFiles(files);
        const packResult = await packer.run();
        if (packResult.success && packResult.hasChange) {
            if (await upload(getUploadAssets(packResult), { basedir: config.approot, additionalHeader })) {
                // await admin.core({ type: 'auth', sub: { type: 'reload-server', app } }, additionalHeader);
            }
        }
    });
}

export function build(watch: boolean, additionalHeader?: string): void {
    (watch ? buildWatch : buildOnce)(additionalHeader);
}
