import path from 'node:path';
import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import chalk from 'chalk-template';
import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { logInfo } from './common.ts';

interface ESLintOptions {
    files: string | string[], // pattern
    ignore?: string[], // pattern
    falsyRules?: boolean, // enable falsy rules to check for postential true positives
    additionalLogHeader?: string,
}
// return false for has issues, but build scripts may not fail on this
export async function eslint(options: ESLintOptions): Promise<boolean> {
    const eslint = new ESLint({
        ignorePatterns: options.ignore,
        overrideConfigFile: true,
        plugins: {
            tseslint: tseslint.plugin as any,
            stylistic,
        },
        overrideConfig: [
            js.configs.recommended,
            stylistic.configs.recommended,
            ...tseslint.configs.recommended as any,
            {
                linterOptions: {
                    reportUnusedDisableDirectives: true,
                },
                rules: {
                    // when-I-use-I-really-need-to-use
                    '@typescript-eslint/no-explicit-any': 'off',
                    // when-I-use-I-really-need-to-use
                    // why do I need to expecting error? I ts-ignore because ts is not clever enough, I do not expect error
                    '@typescript-eslint/ban-ts-comment': 'off',
                    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
                    // not interested
                    '@stylistic/arrow-parens': 'off',
                    // document says default 1tbs but errors say not
                    '@stylistic/brace-style': options.falsyRules ? ['error', '1tbs', { 'allowSingleLine': true }] : 'off',
                    // document says default 4 but errors say default 2, UPDATE: too many false positive on nested ternery expression
                    '@stylistic/indent': options.falsyRules ? ['error', 4] : 'off',
                    // why is this a separate rule with 2 space idention?
                    '@stylistic/indent-binary-ops': 'off',
                    '@stylistic/lines-between-class-members': 'off',
                    // not sufficient option to follow my convention
                    '@stylistic/jsx-closing-bracket-location': 'off',
                    // not sufficient option to follow my convention, who invented the very strange default value?
                    '@stylistic/jsx-closing-tag-location': 'off',
                    // not sufficient option to follow my convention
                    '@stylistic/jsx-first-prop-new-line': 'off',
                    // no, fragment already looks like newline
                    '@stylistic/jsx-function-call-newline': 'off',
                    // I'm tired of indenting props according to formatting rules
                    '@stylistic/jsx-indent-props': 'off',
                    // when-I-use-I-really-need-to-use
                    '@stylistic/jsx-one-expression-per-line': 'off',
                    // I need negative rule
                    '@stylistic/jsx-wrap-multilines': 'off',
                    // it's meaningless to move properties to next line and fight with idention rules
                    '@stylistic/jsx-max-props-per-line': 'off',
                    '@stylistic/jsx-quotes': 'off',
                    // when-I-use-I-really-need-to-use
                    '@stylistic/max-statements-per-line': 'off',
                    '@stylistic/member-delimiter-style': ['error', {
                        'multiline': {
                            'delimiter': 'comma',
                            'requireLast': true,
                        },
                        'singleline': {
                            'delimiter': 'comma',
                            'requireLast': false,
                        },
                    }],
                    // I'm tired of indenting/spacing ternary expressions according formatting rules
                    '@stylistic/multiline-ternary': 'off',
                    '@stylistic/no-multi-spaces': ['error', { ignoreEOLComments: true }],
                    // not interested
                    '@stylistic/padded-blocks': 'off',
                    // in old days I say it's not possible to enable on existing code base
                    // now I say it's not possible to enforcing overall code base
                    '@stylistic/quotes': 'off',
                    // when-I-use-I-really-need-to-use
                    '@stylistic/quote-props': 'off', // ['error', 'consistent'],
                    '@stylistic/semi': ['error', 'always'],
                },
            },
        ],
    });

    const lintResults = await eslint.lintFiles(options.files);

    let hasIssue = false;
    // // the default formatter is extremely bad when one message is long, so have to implement on your own
    // const formattedResults = (await eslint.loadFormatter('stylish')).format(lintResults);
    // if (formattedResults) { console.log(formattedResults); }
    for (const fileResult of lintResults) {
        if (fileResult.errorCount == 0) { continue; }
        hasIssue = true;
        const relativePath = path.relative(process.cwd(), fileResult.filePath);
        console.log(chalk`\n${relativePath} {yellow ${fileResult.errorCount}} errors`);
        for (const message of fileResult.messages) {
            console.log(chalk`{gray ${message.line}:${message.column}} ${message.message} {gray ${message.ruleId}}`);
        }
    }

    if (!hasIssue) { logInfo(`eslint${options.additionalLogHeader ?? ''}`, 'clear'); }
    return !hasIssue;
}
