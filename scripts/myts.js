const fs = require('fs');
const path = require('path');
const ts = require("typescript");

function compile(fileNames, options) {
    const program = ts.createProgram(fileNames, options);
    const emitResult = program.emit();

    ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics).forEach(diagnostic => {
        if (diagnostic.file) {
            const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
            const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
            console.log(`${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`);
        } else {
            console.log(`${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`);
        }
    });

    process.exit(emitResult.emitSkipped ? 1 : 0);
}

function getAllFiles(directory, predicate) {
    const results = [];

    function impl(d) {
        const items = fs.readdirSync(d, { withFileTypes: true });
        
        results.push(...items.filter(i => i.isFile() && predicate(i.name)).map(i => path.join(d, i.name)));
        for (const sub of items.filter(i => i.isDirectory()).map(i => path.join(d, i.name))) {
            impl(sub);
        }
    }

    impl(directory);
    return results;
}

const projectDirectory = process.cwd();
const formatHost = {
    getCanonicalFileName: f => path.relative(projectDirectory, f),
    getCurrentDirectory: () => projectDirectory,
    getNewLine: () => '\n',
};

function reportDiagnostic(diagnostic) {
    console.error('Error', diagnostic.code, ':', ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
}
function reportWatchStatusChanged(diagnostic) {
    console.info(ts.formatDiagnostic(diagnostic, formatHost));
}

function watch(fileNames, config) {
    const host = ts.createWatchCompilerHost(fileNames, config, 
        ts.sys, ts.createEmitAndSemanticDiagnosticsBuilderProgram, reportDiagnostic, reportWatchStatusChanged);
   
    const originalCreateProgram = host.createProgram;
    host.createProgram = (rootNames, options, host, oldProgram) => {
        console.log('** before create program');
        return originalCreateProgram(rootNames, options, host, oldProgram);    
    };

    const originalAfterProgramCreate = host.afterProgramCreate;
    host.afterProgramCreate = program => {
        console.log('** after create program');
        if (originalAfterProgramCreate) originalAfterProgramCreate(program);
    };

    ts.createWatchProgram(host);
}

const rootDirectory = path.join(process.cwd(), 'src/server');
const files = getAllFiles(rootDirectory, name => path.extname(name) == '.ts');
const config =  {
    module: ts.ModuleKind.CommonJS,
    allowSyntheticDefaultImports: true,
    target: ts.ScriptTarget.ES2017,
    noEmitOnError: true,
    noErrorTruncation: true,
    noFallthroughCasesInSwitch: true,
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
    outDir: './custom_build',
};

// compile(['src/server/index.ts'], config);
watch(['src/server/index.ts'], config);

