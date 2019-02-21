const child_process = require('child_process');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const minimist = require('minimist');
const ts = require('typescript');
const webpack = require('webpack');
const nodePackage = require('../package.json');
const DirectoryWatcher = require('./dir_watcher.js');

// build index-page --watch
// build logs-page --watch
// build blog-app [--dev | --pro]
// build cost-app --watch
// build drive-app
// build server

// npm run build index-page
// npm run build cost-app
// npm run build server
// npm run watch server => build server --watch
// npm run watch index-page => build index-page --watch

// web pages and web apps names are auto
// web page's entry is 'src/client/<name>.ts' and 'src/client/<name>.less'
// web app's entry is 'src'client<name>/app.tsx'

const projectDirectory = process.cwd();
const raiseError = message => { console.log(message); process.exit(0); }

function checkProcessArguments() {
    if (process.argv.length < 3) {
        raiseError(chalk`{red error}: not enough arguments`);
    }

    const target = process.argv[2];
    const [name, type] = target == 'server' ? ['server', 'server']
        : target.endsWith('-page') ? [target.slice(0, -5), 'page']
        : target.endsWith('-app') ? [target.slice(0, -4), 'app']
        : (() => { raiseError(chalk`{red error}: invalid target`); })();

    const options = minimist(process.argv.slice(3));
    return { targetName: name, targetType: type, targetOptions: options };
}

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
const typescriptServerConfig = {
    ...typescriptBaseConfig,
    outDir: './custom_build',
};

function buildServer(options) {
     
    // NOTE: according to source code, createProgramOptions.options is used instead of CompilerHost.options
    const host = ts.createCompilerHost({});
   
    const originalWriteFile = host.writeFile;
    host.writeFile = (fileName, content, _writeBOM, _onError, sourceFiles) => {
        console.log(`writing file '${fileName}', content length ${content.length}` 
            + `, source file count: ${sourceFiles ? sourceFiles.length : 'no source files'}`);
        originalWriteFile(fileName, content, _writeBOM, _onError, sourceFiles);
    };
   
    const program = ts.createProgram({
        rootNames: ['src/server/index.ts'],
        options: typescriptServerConfig,
        host: host,
    });

    const emitResult = program.emit();
    console.log('emit ' + (emitResult.emitSkipped ? 'failed' : 'success'));
    for (const { file, start, messageText } of ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics)) {
        if (file) {
            const { line, character } = file.getLineAndCharacterOfPosition(start);
            process.stdout.write(`${file.fileName} (${line + 1},${character + 1}): `);
        }
        console.log(ts.flattenDiagnosticMessageText(messageText, '\n'));
    }

    webpack({
        mode: 'development',
        entry: './custom_build/index.js',
        target: 'node',
        output: {
            path: path.join(projectDirectory, 'build'),
            filename: 'server.js',
        },
        externals: Object.keys(nodePackage.dependencies)
            .reduce((x, e) => { x[e] = 'commonjs ' + e; return x; }, {}),
    }, (err, stats) => {
        if (err) {
            console.log('webpack error: ');
            console.log(err);
            return;
        }

        const statData = stats.toJson();
        if (stats.hasErrors()) {
            console.log('errors: ', statData.errors);
            return;
        }
        if (stats.hasWarnings()) {
            console.log('warnings: ', statData.warnings.join('\n'));
        }

        const { version, hash, time, builtAt, assets, chunks, modules } = statData;
        console.log({ version, hash, time, builtAt });

        for (const asset of assets) {
            console.log(`asset ${asset.name} size ${asset.size}`);
        }
        for (const chunk of chunks) {
            console.log(`chunk#${chunk.id}: ${chunk.names.join(', ')}`);
        }
        for (const module of modules) {
            console.log(`module#${module.id}: '${module.name}', size ${module.size}`);
        }
    });
}

const { targetName, targetType, targetOptions } = checkProcessArguments();

if (targetName == 'server') {
    buildServer(targetOptions);
}

