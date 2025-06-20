import fs from 'node:fs/promises';
import path from 'node:path';
import { minify } from 'terser';
import ts from 'typescript';

// this script builds the entire build script (aka akari)

// akari used to build self by self, but that's proved to be too complex and cause too many errors
// so use this standalone one-file non-typescript script instead, this script is called akari-build
// although one-file and non-typescript, akari-build still follow the design pattern to call typescript
// nodejs api and bundle on my own

const entryFile = 'src/core/index.ts';

// Create a program
const program = ts.createProgram([entryFile], {
    lib: ['lib.esnext.d.ts'],
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    skipLibCheck: true,
    noEmitOnError: true,
    // NOTE for strict
    // I spent some time to fix non strict warnings and a lot of tsc-is-not-clever-enough / their-document-says-this-ask-them exclamation marks
    // (one of the reasons is that my (FreskyZ@outlook.com) code is very strongly typed and well considered safe)
    // so I decided to continue this pattern, every some time use this environment variable to check for non strict warnings and possible errors, but most of the time this switch is not on
    strict: 'AKARIN_STRICT' in process.env,
    noImplicitAny: true,
    noFallthroughCaseInSwitch: true,
    noImplicitReturns: true,
    noImplicitThis: true,
    noUnusedLocals: true,
    noUnusedParameters: true,
    strictNullChecks: 'AKARIN_STRICT' in process.env,
    strictFunctionTypes: true,
    strictBindCallApply: true,
    strictBuiltinIteratorReturn: true,
    removeComments: true,
    outDir: '/vbuild',
});

const sourceFiles = program.getSourceFiles().filter(sf =>
    !sf.fileName.includes('node_modules') && sf.fileName.startsWith(process.cwd())
);

const moduleDeps = {};

for (const sourceFile of sourceFiles) {
    const imports = [];
    ts.forEachChild(sourceFile, node => {
        if (ts.isImportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
            imports.push(node.moduleSpecifier.text);
        }
        if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
            imports.push(node.moduleSpecifier.text);
        }
    });
    moduleDeps[sourceFile.fileName] = imports;
}

console.log('Module dependencies:', moduleDeps);

// Emit the program
const emittedFiles = {};
const emitResult = program.emit(undefined, (fileName, data) => {
    emittedFiles[fileName] = data;
});

const allDiagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);

allDiagnostics.forEach(diagnostic => {
    if (diagnostic.file) {
        const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
        const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
        console.error(`${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`);
    } else {
        console.error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
    }
});

// console.log(emittedFiles);

// TODO pack

const resultJs = emittedFiles['/vbuild/index.js'];
try {
    const minifyResult = await minify(resultJs, {
        sourceMap: false,
        module: true,
        compress: { ecma: 2022 },
    });
    await fs.writeFile('server.js', minifyResult.code);
} catch (err) {
    console.error('terser error', err, resultJs);
}

if (emitResult.emitSkipped) {
    process.exit(1);
} else {
    console.log('TypeScript transpilation completed successfully.');
}
