import * as fs from 'fs';
import * as chalk from 'chalk';
import { logInfo, logCritical } from '../common';
import { TypeScriptOptions, transpile } from '../tools/typescript';
import { MyPackOptions, pack } from '../tools/mypack';

const typescriptOptions: TypeScriptOptions = {
    base: 'normal',
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

    transpile(typescriptOptions, { afterEmit: async ({ success, files }): Promise<void> => {
        if (!success) {
            return logCritical('mka', chalk`{yellow self} failed at transpile`);
        }

        const packResult = await pack({ ...mypackOptions, files });
        if (!packResult.success) {
            return logCritical('mka', chalk`{yellow self} failed at pack`);
        }

        fs.writeFileSync('maka', '#!/usr/bin/env node\n' + packResult.jsContent);
        logInfo('mka', 'self completed successfully');
    } });
}
