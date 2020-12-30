import * as chalk from 'chalk';
import { logInfo, logCritical } from '../common';
import { TypeScriptOptions, typescript } from '../tools/typescript';
import { MyPackOptions, mypack } from '../tools/mypack';
import { upload } from '../tools/ssh';
import { admin } from '../tools/admin-local';

const typescriptOptions: TypeScriptOptions = {
    base: 'normal',
    entry: ['script/local.ts', 'script/server.ts'],
    sourceMap: 'no',
    watch: false,
};

const getMyPackOptions1 = (files: MyPackOptions['files']): MyPackOptions => ({
    type: 'app',
    entry: '/vbuild/local.js',
    files,
    output: 'akari',
    minify: true,
    shebang: true,
    cleanupFiles: false,
});
const getMyPackOptions2 = (files: MyPackOptions['files']): MyPackOptions => ({
    type: 'app',
    entry: '/vbuild/server.js',
    files,
    writeFile: false,
    minify: true,
    shebang: true,
    cleanupFiles: false,
});

export async function build(): Promise<void> {
    logInfo('akr', chalk`{cyan self}`);

    const checkResult = typescript(typescriptOptions).check();
    if (!checkResult.success) {
        return logCritical('akr', chalk`{cyan self} failed at transpile`);
    }

    // multi target mypack is complex, just call twice
    const packResult1 = await mypack(getMyPackOptions1(checkResult.files)).run();
    if (!packResult1.success) {
        return logCritical('akr', chalk`{cyan self} failed at pack (1)`);
    }

    const packResult2 = await mypack(getMyPackOptions2(checkResult.files)).run();
    if (!packResult2.success) {
        return logCritical('akr', chalk`{cyan self} failed at pack (2)`);
    }

    const uploadResult = await upload([{ name: 'akari', data: packResult2.resultJs, remote: 'WEBROOT/akari', mode: 0o777 }]);
    if (!uploadResult) {
        return logCritical('akr', chalk`{cyan self} failed at upload`);
    }
    
    await admin({ type: 'content', data: { type: 'reload-client', app: 'wimm' } });
    logInfo('akr', chalk`{cyan self} completed successfully`);
}
