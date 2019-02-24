const path = require('path');
const ts = require('typescript');
const nodePackage = require('../package.json');

const projectDirectory = process.cwd();

const typescriptBaseConfig = {
    module: ts.ModuleKind.CommonJS,
    allowSyntheticDefaultImports: true,
    target: ts.ScriptTarget.ES2017,
    noEmitOnError: true,
    noErrorTruncation: true,
    noFallthroughCaseInSwitch: true,
    noImplicitAny: true,
    noImplicitReturns: true,
    noImplicitThis: true,
    noUnusedLocals: true,
    noUnusedParameters: true,
    strict: true,
    strictFunctionTypes: true,
    strictBindCallApply: true,
    strictNullChecks: true,
    strictPropertyInitialization: true,
};

module.exports = {
    'tsc:server:roots': [
        'src/server/index.ts',
        'src/server/dev-main.ts',
    ],
    'tsc:server:options': {
        ...typescriptBaseConfig,
        outDir: '/dummy-build',
    },
    'webpack:server': {
        mode: 'development',
        entry: '/dummy-build/index.js',
        target: 'node',
        output: {
            path: path.join(projectDirectory, 'build'),
            filename: 'server.js',
        },
        externals: Object.keys(nodePackage.dependencies)
            .reduce((x, e) => { x[e] = 'commonjs ' + e; return x; }, {}),
    },
};

