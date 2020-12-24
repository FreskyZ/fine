import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as fs from 'fs';
import * as chalk from 'chalk';
import { logInfo, logError, logCritical } from '../common';
import { admin } from '../tools/admin';
import { TypeScriptOptions, typescript } from '../tools/typescript';
import { MyPackOptions, MyPackResult, mypack } from '../tools/mypack';

const getTypescriptOptions = (watch: boolean): TypeScriptOptions => ({
    base: 'normal',
    entry: 'src/server-core/index.ts',
    sourceMap: 'hide',
    watch,
});

const getMyPackOptions = (files: MyPackOptions['files'], lastResult?: MyPackResult): MyPackOptions => ({
    type: 'app',
    files,
    entry: '/vbuild/server-core/index.js',
    sourceMap: true,
    output: 'dist/main/server.js',
    printModules: true,
    minify: true,
    lastResult,
});

async function buildOnce(): Promise<void> {
    logInfo('mka', chalk`{cyan server-core}`);
    await fs.promises.mkdir('dist/main', { recursive: true });

    const checkResult = typescript(getTypescriptOptions(false)).check();
    if (!checkResult.success) {
        return logCritical('mka', chalk`{cyan server-core} failed at transpile typescript`);
    }

    const packResult = await mypack(getMyPackOptions(checkResult.files));
    if (!packResult.success) {
        return logCritical('mka', chalk`{cyan server-core} failed at pack`);
    }

    logInfo('mka', chalk`{cyan server-core} completed successfully`);
}

// only watch server-core require restart server process
let serverProcess: ChildProcessWithoutNullStreams = null;
function startOrRestartServer() {
    function start() {
        // mds: my dev server
        logInfo('mds', 'start server');
        serverProcess = spawn('node', ['dist/main/server.js']);
        
        serverProcess.stdout.pipe(process.stdout);
        serverProcess.stderr.pipe(process.stderr);
        serverProcess.on('error', error => {
            logError('mds', `server process error ${error.message}`);
        });
        serverProcess.on('exit', code => { 
            (code == 0 ? logInfo : logError)('mds', `server process exited with code ${code}`); 
            serverProcess = null; 
        });
    }

    if (serverProcess != null) {
        serverProcess.once('exit', start);
        admin({ type: 'shutdown' });
    } else {
        start();
    }
}

function buildWatch() {
    logInfo('mka', chalk`watch {cyan server-core}`);
    process.on('exit', () => serverProcess?.kill()); // make sure
    fs.mkdirSync('dist/main', { recursive: true });  // maka sure 2

    let lastResult: MyPackResult = null;
    typescript(getTypescriptOptions(true)).watch(async ({ files }) => {
        const currentResult = await mypack(getMyPackOptions(files, lastResult));
        if (!currentResult.success) {
            return;
        }
        if (currentResult.hash != lastResult?.hash) {
            startOrRestartServer();
        }
        lastResult = currentResult;
    });
}

export function build(watch: boolean) {
    (watch ? buildWatch : buildOnce)();
}
