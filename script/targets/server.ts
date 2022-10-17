import * as chalk from 'chalk';
import { logInfo, logCritical } from '../common';
import { eslint } from '../tools/eslint';
import { Asset, upload } from '../tools/ssh';
import { TypeScriptOptions, typescript } from '../tools/typescript';
import { MyPackOptions, MyPackResult, mypack } from '../tools/mypack';

const typescriptOptions: TypeScriptOptions = {
    base: 'normal',
    entry: `script/server/index.ts`,
    sourceMap: 'no',
    watch: false,
};
const getMyPackOptions = (files: MyPackOptions['files']): MyPackOptions => ({
    type: 'app',
    entry: `/vbuild/server/index.js`,
    files,
    minify: true,
    shebang: true,
    cleanupFiles: false,
});

const getUploadAssets = (packResult: MyPackResult): Asset[] => [
    { data: packResult.resultJs, remote: 'akari', mode: 0o777 },
];

export async function build(): Promise<void> {
    logInfo('akr', chalk`{cyan self}`);
    await eslint('self', 'node', 'script/**/*.ts');

    const checkResult = typescript(typescriptOptions).check();
    if (!checkResult.success) {
        return logCritical('akr', chalk`{cyan self} failed at transpile`);
    }

    const packResult = await mypack(getMyPackOptions(checkResult.files)).run();
    if (!packResult.success) {
        return logCritical('akr', chalk`{cyan self} failed at pack`);
    }

    const uploadResult = await upload(getUploadAssets(packResult));
    if (!uploadResult) {
        return logCritical('akr', chalk`{cyan self} failed at upload`);
    }

    logInfo('akr', chalk`{cyan self} completed successfully`);
}
