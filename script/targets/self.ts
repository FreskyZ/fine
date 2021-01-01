import * as fs from 'fs';
import * as chalk from 'chalk';
import { logInfo, logCritical } from '../common';
import { eslint } from '../tools/eslint';
import { Asset, upload } from '../tools/ssh';
import { TypeScriptOptions, typescript } from '../tools/typescript';
import { MyPackOptions, MyPackResult, mypack } from '../tools/mypack';

const typescriptOptions: TypeScriptOptions = {
    base: 'normal',
    entry: ['script/index.ts', 'script/server/index.ts'],
    sourceMap: 'no',
    watch: false,
};

const getMyPackOptions1 = (files: MyPackOptions['files']): MyPackOptions => ({
    type: 'app',
    entry: '/vbuild/index.js',
    files,
    output: 'akari',
    minify: true,
    shebang: true,
    cleanupFiles: false,
});
const getMyPackOptions2 = (files: MyPackOptions['files']): MyPackOptions => ({
    type: 'app',
    entry: '/vbuild/server/index.js',
    files,
    minify: true,
    shebang: true,
    cleanupFiles: false,
});

const getUploadAssets = (packResult: MyPackResult): Asset[] => [
    { data: packResult.resultJs, remote: 'WEBROOT/akari', mode: 0o777 },
];

export async function build(): Promise<void> {
    logInfo('akr', chalk`{cyan self}`);
    await eslint('self', 'node', 'script/**/*.ts');

    const checkResult = typescript(typescriptOptions).check();
    if (!checkResult.success) {
        return logCritical('akr', chalk`{cyan self} failed at transpile`);
    }

    // multi target mypack is complex, just call twice
    await Promise.all([
        (async (): Promise<void> => {
            const packResult = await mypack(getMyPackOptions1(checkResult.files), '(1)').run();
            if (!packResult.success) {
                return logCritical('akr', chalk`{cyan self} failed at pack (1)`);
            }
            fs.writeFileSync('akari', packResult.resultJs);
        })(),
        (async (): Promise<void> => {
            const packResult = await mypack(getMyPackOptions2(checkResult.files), '(2)').run();
            if (!packResult.success) {
                return logCritical('akr', chalk`{cyan self} failed at pack (2)`);
            }

            const uploadResult = await upload(getUploadAssets(packResult));
            if (!uploadResult) {
                return logCritical('akr', chalk`{cyan self} failed at upload`);
            }
        })(),
    ]);

    logInfo('akr', chalk`{cyan self} completed successfully`);
}
