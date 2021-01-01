import * as fs from 'fs';
import * as chalk from 'chalk';
import { ESLint } from 'eslint';
import { logInfo, logCritical } from '../common';
import { TypeScriptOptions, typescript } from '../tools/typescript';
import { MyPackOptions, MyPackResult, mypack } from '../tools/mypack';
import { Asset, upload } from '../tools/ssh';

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
    minify: true,
    shebang: true,
    cleanupFiles: false,
});

const getUploadAssets = (packResult: MyPackResult): Asset[] => [
    { data: packResult.resultJs, remote: 'WEBROOT/akari', mode: 0o777 },
];

export async function build(): Promise<void> {
    logInfo('akr', chalk`{cyan self}`);

    if ('AKARIN_ESLINT' in process.env) {
        const eslint = new ESLint({
            useEslintrc: false,
            baseConfig: {
                parser: '@typescript-eslint/parser',
                parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
                plugins: ['@typescript-eslint'],
                env: { 'node': true },
                extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
                rules: {
                    'array-callback-return': 'warn',
                    'class-methods-use-this': 'error',
                    'comma-dangle': 'off', // overwrite by ts-eslint
                    'eol-last': 'error',
                    'no-constant-condition': 'off', // do-while-true and infinite-generator are all useful patterns when needed
                    'no-multiple-empty-lines': 'error',
                    "no-extra-parens": 'off', // this does not have the 'except boolean-and-or-mixed' option
                    'no-lone-blocks': 'warn',
                    'no-sequences': 'error', // this is comma expression
                    "no-template-curly-in-string": 'warn',
                    'no-trailing-spaces': 'error',
                    'no-unused-expressions': 'off', // overwrite by ts-eslint
                    'prefer-named-capture-group': 'warn',
                    'require-await': 'error',
                    'semi': 'off', // overwrite by ts-eslint
                    '@typescript-eslint/comma-dangle': ['warn', 'always-multiline'],
                    '@typescript-eslint/consistent-type-imports': 'off', // I'd like to only include 'all imports are types' but there is no option, maybe enable it some time
                    "@typescript-eslint/explicit-module-boundary-types": ['warn', { allowArgumentsExplicitlyTypedAsAny: true }],
                    '@typescript-eslint/member-delimiter-style': ['warn', { multiline: { delimiter: 'comma', requireLast: true }, singleline: { delimiter: 'comma', requireLast: false } }],
                    '@typescript-eslint/no-confusing-non-null-assertion': 'warn',
                    "@typescript-eslint/no-explicit-any": 'off',
                    '@typescript-eslint/no-non-null-assertion': 'off', // explained in tools/typescript note for strict mode
                    '@typescript-eslint/no-unnecessary-condition': 'off',     // this want a tsconfig file
                    '@typescript-eslint/no-unused-expressions': 'error',
                    '@typescript-eslint/prefer-includes': 'off',              // this want a tsconfig file
                    '@typescript-eslint/prefer-readonly': 'off',              // this want a tsconfig file
                    '@typescript-eslint/semi': 'error',
                    '@typescript-eslint/switch-exhaustiveness-check': 'off',  // this want a tsconfig file
                    '@typescript-eslint/triple-slash-reference': 'off',
                },
            },
            cache: true,
            cacheLocation: '.cache/eslint-self',
        });
        const lintResults = await eslint.lintFiles("script/**/*.ts");
        const lintFormater = await eslint.loadFormatter('stylish');
        console.log(lintFormater.format(lintResults));
    }

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
