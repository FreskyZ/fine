import * as fs from 'fs';
import * as chalk from 'chalk';
import { logInfo, logError } from './common';
import { TypeScriptCompilerOptions, transpileOnce } from './run-typescript';
import { MyPackOptions, pack } from './run-mypack';

const typescriptEntry = ['script/index.ts'];
const typescriptOptions = {
    types: ['node'],
    outDir: '/vbuild',
} as TypeScriptCompilerOptions;

function createWriteFileHook(files: MyPackOptions['files']) {
    return ((name: string, content: string) => {
        files.push({ name, content });
    }) as TypeScriptCompilerOptions['writeFileHook'];
}

const mypackOptions: MyPackOptions = {
    type: 'app',
    entry: '/vbuild/index.js',
    files: [],
    output: 'maka',
    minify: true,
}

export async function build() {
    logInfo('mka', chalk`{yellow self}`);

    const files: MyPackOptions['files'] = [];
    if (!transpileOnce(typescriptEntry, { ...typescriptOptions, writeFileHook: createWriteFileHook(files) } as TypeScriptCompilerOptions)) {
        logError('mka', 'self failed at transpile typescript');
        process.exit(1);
    }

    const packResult = await pack({ ...mypackOptions, files });
    if (!packResult.success) {
        logError('mka', 'self failed at pack');
        process.exit(1);
    }
    fs.writeFileSync('maka', '#!/usr/bin/env node\n' + packResult.jsContent);

    logInfo('mka', 'self completed successfully');
}
