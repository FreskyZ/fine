import * as fs from 'fs';
import * as chalk from 'chalk';
import { logInfo, logCritical } from '../common';
import { eslint } from '../tools/eslint';
import { Asset, upload } from '../tools/ssh';
import { TypeScriptOptions, typescript } from '../tools/typescript';
import { MyPackOptions, MyPackResult, mypack } from '../tools/mypack';

const entryNames = {
    'local': 'index',
    'server': 'index-server',
    'app': 'index-app',
} as Record<string, string>;

const getTypescriptOptions = (target: string): TypeScriptOptions => ({
    base: 'normal',
    entry: `script/${entryNames[target]}.ts`,
    sourceMap: 'no',
    watch: false,
});
const getMyPackOptions = (target: string, files: MyPackOptions['files']): MyPackOptions => ({
    type: 'app',
    entry: `/vbuild/${entryNames[target]}.js`,
    files,
    minify: true,
    shebang: true,
    cleanupFiles: false,
});

const getUploadAssets = (packResult: MyPackResult): Asset[] => [
    { data: packResult.resultJs, remote: 'akari', mode: 0o777 },
];

export async function build(target: string): Promise<void> {
    logInfo('akr', chalk`{cyan self} ${target}`);
    await eslint('self', 'node', 'script/**/*.ts');

    const checkResult = typescript(getTypescriptOptions(target)).check();
    if (!checkResult.success) {
        return logCritical('akr', chalk`{cyan self} failed at transpile`);
    }

    const packResult = await mypack(getMyPackOptions(target, checkResult.files)).run();
    if (!packResult.success) {
        return logCritical('akr', chalk`{cyan self} failed at pack`);
    }

    if (target == 'local') {
        fs.writeFileSync('akari', packResult.resultJs);
    } else if (target == 'server') {
        const uploadResult = await upload(getUploadAssets(packResult));
        if (!uploadResult) {
            return logCritical('akr', chalk`{cyan self} failed at upload`);
        }
    }

    logInfo('akr', chalk`{cyan self} completed successfully`);
}
