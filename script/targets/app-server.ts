import * as fs from 'fs';
import * as chalk from 'chalk';
import { logInfo, logCritical } from '../common';
import { admin } from '../tools/admin';
import { codegen } from '../tools/codegen';
import { TypeScriptOptions, typescript } from '../tools/typescript';
import { MyPackOptions, MyPackResult, mypack } from '../tools/mypack';

const getTypeScriptOptions = (app: string, watch: boolean): TypeScriptOptions => ({
    base: 'normal',
    entry: `src/${app}/server/index.ts`,
    sourceMap: 'hide',
    watch,
});

const getMyPackOptions = (app: string, files: MyPackOptions['files'], lastResult?: MyPackResult): MyPackOptions => ({
    type: 'lib',
    entry: `/vbuild/${app}/server/index.js`,
    files,
    sourceMap: true,
    output: `dist/${app}/server.js`,
    printModules: true,
    minify: true,
    lastResult,
});

async function buildOnce(app: string): Promise<void> {
    logInfo('mka', chalk`{cyan ${app}-server}`);
    await fs.promises.mkdir(`dist/${app}`, { recursive: true });

    const codegenResult = await codegen(app, 'server').generate();
    if (!codegenResult.success) {
        return logCritical('mka', chalk`{cyan ${app}-server} failed at code generation`);
    }

    const checkResult = typescript(getTypeScriptOptions(app, false)).check();
    if (!checkResult.success) {
        return logCritical('mka', chalk`{cyan ${app}-server} failed at transpile typescript`);
    }

    const packResult = await mypack(getMyPackOptions(app, checkResult.files));
    if (!packResult.success) {
        return logCritical('mka', chalk`{cyan ${app}-server} failed at pack`);
    }

    await admin({ type: 'reload-server', app });
    logInfo('mka', `{cyan ${app}-server} complete successfully`);
}

function buildWatch(app: string) {
    logInfo('mka', chalk`watch {cyan ${app}-server}`);
    fs.mkdirSync(`dist/${app}`, { recursive: true });

    codegen(app, 'server').watch(); // no callback watch is this simple

    let lastResult: MyPackResult = null;
    typescript(getTypeScriptOptions(app, true)).watch(async ({ files }) => {
        const currentResult = await mypack(getMyPackOptions(app, files, lastResult));
        if (!currentResult.success) {
            return;
        }
        if (currentResult.hash != lastResult?.hash) {
            await admin({ type: 'reload-server', app }).catch(() => { /* ignore */});
        }
        lastResult = currentResult;
    });
}

export async function build(app: string, watch: boolean): Promise<void> {
    if (watch) {
        buildWatch(app);
    } else {
        await buildOnce(app);
    }
}