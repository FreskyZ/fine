import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import tls from 'node:tls';
import chalk from 'chalk-template';
import SFTPClient from 'ssh2-sftp-client';
import { minify } from 'terser';
import ts from 'typescript';

const debug = 'AKARI_DEBUG' in process.env;
const config = JSON.parse(await fs.readFile('akaric', 'utf-8'));

// ???
const mycert = await fs.readFile('../../my.crt', 'utf-8');
const originalCreateSecureContext = tls.createSecureContext;
tls.createSecureContext = options => {
    const originalResult = originalCreateSecureContext(options);
    if (!options.ca) {
        originalResult.context.addCACert(mycert);
    }
    return originalResult;
};

const sftpclient = new SFTPClient();
await sftpclient.connect({
    host: config['main-domain'],
    username: config.ssh.user,
    privateKey: await fs.readFile(config.ssh.identity),
    passphrase: config.ssh.passphrase,
});
console.log('sftp connected');

/**
 * @returns {Record<string, string>} transpile result files
 */
function transpile() {
    console.log('transpiling');

    const program = ts.createProgram(['src/static/user.tsx'], {
        lib: ['lib.esnext.d.ts', 'lib.dom.d.ts'],
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        skipLibCheck: true,
        noEmitOnError: true,
        jsx: ts.JsxEmit.ReactJSX,
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

    const /** @type {Record<string, string>} */ result = {};
    const emitResult = program.emit(undefined, (fileName, data) => {
        if (data) {
            result[fileName] = data;
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
        console.log(message);
    }
    return transpileErrors.length ? null : result;
}

async function postprocess(transpileResultJs) {
    console.log('postprocessing');

    transpileResultJs = transpileResultJs.replaceAll('example.com', config['main-domain']);
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
        transpileResultJs = transpileResultJs.replace(new RegExp(`from ['"]${devModule}['"]`), `from '${runtimeModule}'`);
    }

    console.log(`minify`);
    try {
        const minifyResult = await minify(transpileResultJs, {
            module: true,
            compress: { ecma: 2022 },
            format: { max_line_len: 160 },
        });
        return minifyResult.code;
    } catch (err) {
        console.error(chalk`{red error} terser`, err, resultJs);
        return null;
    }
}

async function reportLocalBuildComplete(ok) {
    const response = await fetch(`https://${config['main-domain']}:8001/local-build-complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok }),
    });
    if (response.ok) {
        console.log('POST /local-build-complete ok');
    } else {
        console.log('POST /local-build-complete not ok', response);
    }
}

async function buildAndDeploy() {
    const transpileResult = transpile();
    if (!transpileResult) { console.log('there are error in transpiling'); return await reportLocalBuildComplete(false); }
    const resultJs = await postprocess(transpileResult['/vbuild/user.js']);
    if (!resultJs) { console.log('there are error in postprocessing'); return await reportLocalBuildComplete(false); }
    console.log(`complete build`);

    console.log(`uploading`);
    await sftpclient.fastPut('src/static/user.html', path.join(config.webroot, 'static/user.html'));
    await sftpclient.put(Buffer.from(resultJs), path.join(config.webroot, 'static/user.js'));
    console.log(`complete upload`);

    return await reportLocalBuildComplete(true);
}

const readlineInterface = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});
function connectRemoteCommandCenter() {
    const websocket = new WebSocket(`wss://${config['main-domain']}:8001/for-build`);
    websocket.addEventListener('close', async () => {
        console.log(`websocket: disconnected`);
        await readlineInterface.question('input anything to reconnect: ');
        connectRemoteCommandCenter();
    });
    websocket.addEventListener('error', async error => {
        console.log(`websocket: error:`, error);
        await readlineInterface.question('input anything to reconnect: ');
        connectRemoteCommandCenter();
    });
    websocket.addEventListener('open', async () => {
        console.log(`websocket: connected, you'd better complete authentication quickly`);
        const token = await readlineInterface.question('> ');
        websocket.send(token);
        console.log('listening to remote request');
    });
    websocket.addEventListener('message', event => {
        console.log('websocket: received data', event.data);
        buildAndDeploy();
    });
}
connectRemoteCommandCenter();
