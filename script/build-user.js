import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk-template';
import SFTPClient from 'ssh2-sftp-client';
import { minify } from 'terser';
import ts from 'typescript';

const debug = 'AKARI_DEBUG' in process.env;
const config = JSON.parse(await fs.readFile('akaric', 'utf-8'));

const program = ts.createProgram(['src/static/user.tsx'], {
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

let hasError = false;
console.log('transpiling');
/** @type {Record<string, string>} */
const emittedFiles = {};
const emitResult = program.emit(undefined, (fileName, data) => {
    if (data) {
        emittedFiles[fileName] = data;
    }
});
const transpileErrors = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics).map(diagnostic => {
    if (diagnostic.file) {
        const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
        const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
        return chalk`{red error} ${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`;
    } else {
        return chalk`{red error} ` + ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
    }
});
for (const message of transpileErrors.filter((v, i, a) => a.indexOf(v) == i)) {
    hasError = true;
    console.log(message);
}
if (hasError) {
    console.log('there are errors in transpiling');
    process.exit(1);
}

console.log('postprocessing');
let resultJs = emittedFiles['/vbuild/user.js'];
resultJs = resultJs.replaceAll('example.com', config['main-domain']);
const dependencies = {
    'react': 'https://esm.sh/react@19.1.0',
    'react-dom': 'https://esm.sh/react-dom@19.1.0',
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

let minifyResult;
console.log(`minify`);
try {
    minifyResult = await minify(resultJs, {
        sourceMap: false,
        module: true,
        compress: { ecma: 2022 },
        format: { max_line_len: 160 },
    });
} catch (err) {
    console.error(chalk`{red error} terser`, err, resultJs);
    process.exit(1);
}

console.log(`uploading`);
const client = new SFTPClient();
await client.connect({
    host: config['main-domain'],
    username: config.ssh.user,
    privateKey: await fs.readFile(config.ssh.identity),
    passphrase: config.ssh.passphrase,
});

await client.fastPut('src/static/user.html', path.join(config.webroot, 'static/user.html'));
await client.put(Buffer.from(minifyResult.code), path.join(config.webroot, 'static/user.js'));
client.end();
console.log(`complete build user page`);
