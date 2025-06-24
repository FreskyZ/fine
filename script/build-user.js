import fs from 'node:fs/promises';
import path from 'node:path';
import { minify } from 'terser';
import ts from 'typescript';

// build user.tsx
// invoke ts node api only, no bundle,
// but need to handle config substitution and import mapping, which is very different from build core, so separate file for now

const entryFile = path.resolve('src/static/user.tsx');

// Create a program
const program = ts.createProgram([entryFile], {
    lib: ['lib.esnext.d.ts', 'lib.dom.d.ts'],
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    skipLibCheck: true,
    noEmitOnError: true,
    jsx: ts.JsxEmit.ReactJSX,
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

// Emit the program
/** @type {Record<string, string>} */
const emittedFiles = {};
const emitResult = program.emit(undefined, (fileName, data) => {
    if (data) {
        emittedFiles[fileName] = data;
    }
});
ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics).forEach(diagnostic => {
    if (diagnostic.file) {
        const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
        const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
        console.error(`${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`);
    } else {
        console.error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
    }
});

let resultJs = emittedFiles['/vbuild/user.js'];
// console.log(resultJs);

resultJs = resultJs.replaceAll('example.com', 'freskyz.com');
const dependencies = {
    'react': 'https://esm.sh/react@19.1.0',
    'react-dom/client': 'https://esm.sh/react-dom@19.1.0/client',
    'dayjs': 'https://esm.sh/dayjs@1.11.13',
    'dayjs/plugin/utc.js': 'https://esm.sh/dayjs@1.11.13/plugin/utc.js',
    'dayjs/plugin/timezone.js': 'https://esm.sh/dayjs@1.11.13/plugin/timezone.js',
    '@emotion/react': 'https://esm.sh/@emotion/react@11.14.0',
    '@emotion/react/jsx-runtime': 'https://esm.sh/@emotion/react@11.14.0/jsx-runtime',
}
for (const [devModule, runtimeModule] of Object.entries(dependencies)) {
    resultJs = resultJs.replace(new RegExp(`from ['"]${devModule}['"]`), `from '${runtimeModule}'`);
}

try {
    const minifyResult = await minify(resultJs, {
        sourceMap: false,
        module: true,
        compress: { ecma: 2022 },
        format: { max_line_len: 160 },
    });
    await fs.writeFile('user.js', minifyResult.code);
} catch (err) {
    console.error('terser error', err, resultJs);
}

if (emitResult.emitSkipped) {
    process.exit(1);
} else {
    console.log('TypeScript transpilation completed successfully.');
}
