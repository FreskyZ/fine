import * as fs from 'fs/promises';
import * as chalk from 'chalk';
import { admin } from './admin';
import { logInfo, logError } from './common';
import { TypeScriptCompilerOptions, transpileOnce, transpileWatch } from './run-typescript';
import { MyPackOptions, MyPackResult, pack } from './run-mypack';

function getTypescriptEntry(app: string) {
    return `src/${app}/server/index.ts`;
}
const typescriptOptions: TypeScriptCompilerOptions = {
    sourceMap: true,
    outDir: '/vbuild',
};
function createMyPackOptions(app: string, files: MyPackOptions['files']): MyPackOptions {
    return {
        type: 'lib',
        entry: `/vbuild/${app}/server/index.js`,
        files,
        sourceMap: true,
        output: `dist/${app}/server.js`,
        printModules: true,
        minify: false,
    };
}

async function buildOnce(app: string) {
    logInfo('mka', chalk`{yellow ${app}-server}`);

    const files: MyPackOptions['files'] = [];
    if (!transpileOnce(getTypescriptEntry(app), { ...typescriptOptions, 
        writeFileHook: (name: string, content: string) => files.push({ name, content }),
    } as unknown as TypeScriptCompilerOptions)) {
        logError('mka', chalk`{yellow ${app}-server} failed at transpile typescript`);
        process.exit(1);
    }

    const packResult = await pack(createMyPackOptions(app, files));
    if (!packResult.success) {
        logError('mka', chalk`{yellow ${app}-server} failed at pack`);
        process.exit(1);
    }

    await fs.writeFile(`dist/${app}/server.js`, packResult.jsContent);
    await fs.writeFile(`dist/${app}/server.js.map`, packResult.mapContent);

    await admin({ type: 'reload-app-server', app });
    logInfo('mka', `${app}-server completed successfully`);
}

function buildWatch(app: string) {
    logInfo('mka', chalk`watch {yellow ${app}-server}`);

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
            const currentResult = await pack(createMyPackOptions(app, files));
            if (currentResult.success) {
                await fs.writeFile(`dist/${app}/server.js`, currentResult.jsContent);
                await fs.writeFile(`dist/${app}/server.js.map`, currentResult.mapContent);
            }

            if (currentResult.hash != lastResult?.hash) {
                await admin({ type: 'reload-app-server', app });
            }
            lastResult = currentResult;
        },
    } as unknown as TypeScriptCompilerOptions);
}

export async function build(app: string, watch: boolean): Promise<void> {
    if (watch) {
        buildWatch(app);
    } else {
        await buildOnce(app);
    }
}