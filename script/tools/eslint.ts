import { ESLint } from 'eslint';
import { logInfo } from '../common';

export async function eslint(target: string, preset: 'node' | 'browser', pattern: string | string[]): Promise<void> {
    if (!('AKARIN_ESLINT' in process.env)) {
        return;
    }

    const eslint = new ESLint({
        useEslintrc: false,
        baseConfig: {
            parser: '@typescript-eslint/parser',
            parserOptions: { ecmaVersion: 2020, sourceType: 'module', ecmaFeatures: { jsx: preset == 'browser' } },
            plugins: preset == 'node'
                ? ['@typescript-eslint']
                : ['@typescript-eslint', 'react', 'react-hooks', 'jsx-a11y'],
            env: { 'node': preset == 'node', 'browser': preset == 'browser' },
            extends: preset == 'node'
                ? ['eslint:recommended', "plugin:@typescript-eslint/recommended"]
                : ['eslint:recommended', "plugin:@typescript-eslint/recommended", 'plugin:react/recommended', 'plugin:react-hooks/recommended', 'plugin:jsx-a11y/recommended'],
            settings: preset == 'node' ? {} : {
                'react': { 'version': '17.0' },
            },
            rules: preset == 'node' ? {
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
                'prefer-named-capture-group': 'off', // it even raises /(...)?/
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
                '@typescript-eslint/no-var-requires': 'off', // see docs/build-script.md for src/core/auto require function call
                '@typescript-eslint/prefer-includes': 'off',              // this want a tsconfig file
                '@typescript-eslint/prefer-readonly': 'off',              // this want a tsconfig file
                '@typescript-eslint/semi': 'error',
                '@typescript-eslint/switch-exhaustiveness-check': 'off',  // this want a tsconfig file
                '@typescript-eslint/triple-slash-reference': 'off',
            } : {
                'array-callback-return': 'warn',
                'class-methods-use-this': 'error',
                'comma-dangle': 'off', // overwrite by ts-eslint
                'eol-last': 'error',
                'jsx-quotes': ['error', 'prefer-single'],
                'no-constant-condition': 'off', // do-while-true and infinite-generator are all useful patterns when needed
                'no-multiple-empty-lines': 'error',
                "no-extra-parens": 'off', // this does not have the 'except boolean-and-or-mixed' option
                'no-lone-blocks': 'warn',
                'no-sequences': 'error', // this is comma expression
                "no-template-curly-in-string": 'warn',
                'no-trailing-spaces': 'error',
                'no-unused-expressions': 'off', // overwrite by ts-eslint
                'prefer-named-capture-group': 'off', // it even raises /(...)?/
                'require-await': 'error',
                'semi': 'off', // overwrite by ts-eslint
                'react/display-name': 'off', // why is this React.createReactClass rule defaulted in this react+typescript world?
                'react/jsx-handler-names': 'off', // this option warns `div.onclick` // ['error', { eventHandlerPrefix: 'handle', eventHandlerPropPrefix: 'handle', checkLocalVariables: true }],
                'react/jsx-no-comment-textnodes': 'error',
                'react/jsx-tag-spacing': 'warn',
                'react/no-children-prop': 'off',
                'react/prop-types': 'off', // why is this defaulted in this react+typescript world?
                'react/self-closing-comp': 'error',
                'jsx-a11y/click-events-have-key-events': 'off', // this is mainly designed for mobile, not no-mouse-pc
                'jsx-a11y/interactive-supports-focus': 'off',   // this is mainly designed for mobile, not no-mouse-pc
                '@typescript-eslint/comma-dangle': ['warn', 'always-multiline'],
                '@typescript-eslint/consistent-type-imports': 'off', // I'd like to only include 'all imports are types' but there is no option, maybe enable it some time
                "@typescript-eslint/explicit-module-boundary-types": ['warn', { allowArgumentsExplicitlyTypedAsAny: true }],
                '@typescript-eslint/member-delimiter-style': ['warn', { multiline: { delimiter: 'comma', requireLast: true }, singleline: { delimiter: 'comma', requireLast: false } }],
                '@typescript-eslint/no-confusing-non-null-assertion': 'warn',
                "@typescript-eslint/no-explicit-any": 'off',
                '@typescript-eslint/no-non-null-assertion': 'off', // explained in tools/typescript note for strict mode
                '@typescript-eslint/no-unnecessary-condition': 'off',     // this want a tsconfig file
                '@typescript-eslint/no-unused-expressions': 'error',
                '@typescript-eslint/no-var-requires': 'off',
                '@typescript-eslint/prefer-includes': 'off',              // this want a tsconfig file
                '@typescript-eslint/prefer-readonly': 'off',              // this want a tsconfig file
                '@typescript-eslint/semi': 'error',
                '@typescript-eslint/switch-exhaustiveness-check': 'off',  // this want a tsconfig file
                '@typescript-eslint/triple-slash-reference': 'off',
            },
        },
        cache: true,
        cacheLocation: `.cache/eslint-${target}`,
    });
    const results = await eslint.lintFiles(pattern);
    const formattedResults = (await eslint.loadFormatter('stylish')).format(results);
    if (formattedResults) {
        console.log(formattedResults);
    } else {
        logInfo('esl', 'clear');
    }
}
