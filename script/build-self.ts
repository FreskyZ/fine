import * as fs from 'fs';
import * as chalk from 'chalk';
import { logInfo, logError } from './common';
import { TypeScriptOptions, transpile } from './run-typescript';
import { MyPackOptions, pack } from './run-mypack';

const typescriptOptions: TypeScriptOptions = {
    entry: 'script/index.ts',
};

const mypackOptions: MyPackOptions = {
    type: 'app',
    entry: '/vbuild/index.js',
    files: [],
    output: 'maka',
    minify: true,
}

export function build() {
    logInfo('mka', chalk`{yellow self}`);

    transpile(typescriptOptions, { afterEmit: async ({ success, files }) => {
        if (!success) {
            logError('mka', chalk`{yellow self} failed at transpile}`);
            process.exit(1);
        }

        const packResult = await pack({ ...mypackOptions, files });
        if (!packResult.success) {
            logError('mka', chalk`{yellow self} failed at pack`);
            process.exit(1);
        }

        fs.writeFileSync('maka', '#!/usr/bin/env node\n' + packResult.jsContent);
        logInfo('mka', 'self completed successfully');
    } });
}
