import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as chalk from 'chalk';
import { admin } from './admin';
import { logInfo, logError, commonReadFileHook, commonWatchReadFileHook } from './common';
import { generate } from './run-codegen';
import { TypeScriptCompilerOptions, transpileOnce, transpileWatch } from './run-typescript';
import { MyPackOptions, MyPackResult, pack } from './run-mypack';

const getTypescriptEntry =(app: string) => `src/${app}/client/index.ts`;
const typescriptOptions: TypeScriptCompilerOptions = {
    sourceMap: true,
    outDir: '/vbuild',
    readFileHook: commonReadFileHook,
    watchReadFileHook: commonWatchReadFileHook,
} as TypeScriptCompilerOptions;

const createMyPackOptions = (app: string, files: MyPackOptions['files'], lastResult?: MyPackResult): MyPackOptions => ({
    type: 'lib',
    entry: `/vbuild/${app}/client/index.js`,
    files,
    sourceMap: true,
    output: `dist/${app}/client.js`,
    printModules: true,
    minify: true,
    lastResult,
});

async function buildOnce(app: string) {
    logInfo('mka', chalk`{yellow ${app}-client}`);

    if (!await generate(app, 'client')) {
        logError('mka', chalk`{yellow ${app}-client} failed at code generation`);
        process.exit(1);
    }

    const files: MyPackOptions['files'] = [];
    if (!transpileOnce(getTypescriptEntry(app), { ...typescriptOptions, 
        writeFileHook: (name: string, content: string) => files.push({ name, content }),
    } as unknown as TypeScriptCompilerOptions)) {
        logError('mka', chalk`{yellow ${app}-client} failed at transpile typescript`);
        process.exit(1);
    }

    const packResult = await pack(createMyPackOptions(app, files));
    if (!packResult.success) {
        logError('mka', chalk`{yellow ${app}-client} failed at pack`);
        process.exit(1);
    }

    await fsp.writeFile(`dist/${app}/client.js`, packResult.jsContent);
    await fsp.writeFile(`dist/${app}/client.js.map`, packResult.mapContent);

    await admin({ type: 'reload-static', key: app });
    logInfo('mka', `${app}-client completed successfully`);
}

function buildWatch(app: string) {
    logInfo('mka', chalk`watch {yellow ${app}-client}`);

    // watch api.xml
    fs.watchFile(`src/${app}/api.xml`, { persistent: false }, (currstat, prevstat) => {
        if (currstat.mtime == prevstat.mtime) {
            return;
        }
        // if error, no emit and tsc watch retranspile will not be triggered
        generate(app, 'client');
    });

    process.on('SIGINT', () => {
        fs.unwatchFile(`src/${app}/api.xml`);
        process.exit(0);
    });

    const files: MyPackOptions['files'] = [];
    let lastResult: MyPackResult = null;

    transpileWatch(getTypescriptEntry(app), { 
        ...typescriptOptions,
        watchWriteFileHook: (name: string, content: string) => {
            const existIndex = files.findIndex(f => f.name == name);
            if (existIndex >= 0) {
                files.splice(existIndex, 1, { name, content });
            } else {
                files.push({ name, content });
            }
        },
        watchEmit: async () => {
            const currentResult = await pack(createMyPackOptions(app, files, lastResult));
            if (currentResult.success) {
                await fsp.writeFile(`dist/${app}/client.js`, currentResult.jsContent);
                await fsp.writeFile(`dist/${app}/client.js.map`, currentResult.mapContent);
            }

            if (currentResult.hash != lastResult?.hash) {
                await admin({ type: 'reload-static', key: app });
            }
            lastResult = currentResult;
        },
    } as unknown as TypeScriptCompilerOptions);
    
    // initial code generation
    generate(app, 'client');
}

export async function build(app: string, watch: boolean): Promise<void> {
    if (watch) {
        buildWatch(app);
    } else {
        await buildOnce(app);
    }
}