import * as chalk from 'chalk';
import { logInfo, logCritical } from '../common';
import { admin } from '../tools/admin';
import { codegen } from '../tools/codegen';
import { Asset, upload } from '../tools/ssh';
import { TypeScriptOptions, typescript } from '../tools/typescript';
import { MyPackOptions, MyPackResult, mypack } from '../tools/mypack';

const getTypeScriptOptions = (app: string, watch: boolean): TypeScriptOptions => ({
    base: 'normal',
    entry: `src/${app}/server/index.ts`,
    sourceMap: 'hide',
    watch,
});
const getMyPackOptions = (app: string, files: MyPackOptions['files']): MyPackOptions => ({
    type: 'lib',
    entry: `/vbuild/${app}/server/index.js`,
    files,
    sourceMap: true,
    output: `dist/${app}/server.js`,
    printModules: true,
    minify: true,
});
const getUploadAssets = (app: string, packResult: MyPackResult): Asset[] => [
    { remote: `WEBROOT/${app}/server.js`, data: packResult.resultJs },
    { remote: `WEBROOT/${app}/server.js.map`, data: packResult.resultMap! },
];

async function buildOnce(app: string): Promise<void> {
    logInfo('akr', chalk`{cyan ${app}-server}`);
    // mkdir(recursive)

    const codegenResult = await codegen(app, 'server').generate();
    if (!codegenResult.success) {
        return logCritical('akr', chalk`{cyan ${app}-server} failed at code generation`);
    }

    const checkResult = typescript(getTypeScriptOptions(app, false)).check();
    if (!checkResult.success) {
        return logCritical('akr', chalk`{cyan ${app}-server} failed at check`);
    }

    const packResult = await mypack(getMyPackOptions(app, checkResult.files)).run();
    if (!packResult.success) {
        return logCritical('akr', chalk`{cyan ${app}-server} failed at pack`);
    }

    const uploadResult = await upload(getUploadAssets(app, packResult));
    if (!uploadResult) {
        return logCritical('akr', chalk`{cyan ${app}-server} failed at upload`);
    }
    const adminResult = await admin({ type: 'auth', data: { type: 'reload-server', app } });
    if (!adminResult) {
        return logCritical('akr', chalk`{cyan ${app}-server} failed at reload`);
    }

    logInfo('akr', chalk`{cyan ${app}-server} complete successfully`);
}

function buildWatch(app: string, additionalHeader?: string) {
    logInfo(`akr${additionalHeader ?? ''}`, chalk`watch {cyan ${app}-server}`);
    // mkdir(recursive)

    codegen(app, 'server', additionalHeader).watch(); // no callback watch is this simple

    const packer = mypack(getMyPackOptions(app, []), additionalHeader);
    typescript(getTypeScriptOptions(app, true), additionalHeader).watch(async ({ files }) => {
        packer.updateFiles(files);
        const packResult = await packer.run();
        if (packResult.success && packResult.hasChange) {
            if (await upload(getUploadAssets(app, packResult), { additionalHeader })) {
                await admin({ type: 'auth', data: { type: 'reload-server', app } }, additionalHeader);
            }
        }
    });
}

export function build(app: string, watch: boolean, additionalHeader?: string): void {
    (watch ? buildWatch : buildOnce)(app, additionalHeader);
}
