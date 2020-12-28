import * as chalk from 'chalk';
import { logInfo, logCritical } from '../common';
import { TypeScriptOptions, typescript } from '../tools/typescript';
import { MyPackOptions, mypack } from '../tools/mypack';

const typescriptOptions: TypeScriptOptions = {
    base: 'normal',
    entry: 'script/maka.ts',
    sourceMap: 'no',
    watch: false,
};

const getMyPackOptions = (files: MyPackOptions['files']): MyPackOptions => ({
    type: 'app',
    entry: '/vbuild/maka.js',
    files,
    output: 'maka',
    minify: true,
    shebang: true,
});

export async function build(): Promise<void> {
    logInfo('mka', chalk`{cyan self}`);

    const checkResult = typescript(typescriptOptions).check();
    if (!checkResult.success) {
        return logCritical('mka', chalk`{cyan self} failed at transpile`);
    }

    const packResult = await mypack(getMyPackOptions(checkResult.files)).run();
    if (!packResult.success) {
        return logCritical('mka', chalk`{cyan self} failed at pack`);
    }

    logInfo('mka', chalk`{cyan self} completed successfully`);
}
