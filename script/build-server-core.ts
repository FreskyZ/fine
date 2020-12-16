import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as fs from 'fs';
import * as chalk from 'chalk';
import { logInfo, logError } from './common';
import { admin } from './admin';
import { TypeScriptOptions, transpile } from './run-typescript';
import { MyPackOptions, MyPackResult, pack } from './run-mypack';

const typescriptOptions: TypeScriptOptions = {
    entry: 'src/server-core/index.ts',
    sourceMap: true,
};

const mypackOptions: MyPackOptions = {
    type: 'app',
    entry: '/vbuild/server-core/index.js',
    files: [],
    sourceMap: true,
    output: 'dist/home/server.js',
    printModules: true,
    minify: true,
}

function buildOnce() {
    logInfo('mka', chalk`{yellow server-core}`);

    transpile(typescriptOptions, { afterEmit: async ({ success, files }) => {
        if (!success) {
            logError('mka', chalk`{yellow server-core} failed at transpile typescript`);
            process.exit(1);
        }

        const packResult = await pack({ ...mypackOptions, files });
        if (!packResult.success) {
            logError('mka', chalk`{yellow server-core} failed at pack`);
            process.exit(1);
        }

        await Promise.all([
            fs.promises.writeFile('dist/home/server.js', packResult.jsContent),
            fs.promises.writeFile('dist/home/server.js.map', packResult.mapContent),
        ]);
        logInfo('mka', 'server-core completed successfully');
    }});
}

// only watch server-core require restart server process
let serverProcess: ChildProcessWithoutNullStreams = null;
export function startOrRestartServer() {
    function start() {
        // mds: my dev server
        logInfo('mds', 'start server');
        serverProcess = spawn('node', ['dist/home/server.js']);
        
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
    logInfo('mka', chalk`watch {yellow server-core}`);
    process.on('exit', () => serverProcess?.kill()); // make sure

    let lastResult: MyPackResult = null;
    transpile({ ...typescriptOptions, watch: true }, { afterEmit: async ({ files }) => {
        const currentResult = await pack({ ...mypackOptions, files, lastResult });
        if (!currentResult.success) {
            return;
        }

        await Promise.all([
            fs.promises.writeFile('dist/home/server.js', currentResult.jsContent),
            fs.promises.writeFile('dist/home/server.js.map', currentResult.mapContent),
        ]);
        if (currentResult.hash != lastResult?.hash) {
            startOrRestartServer();
        }
        lastResult = currentResult;
    }});
}

export function build(watch: boolean) {
    (watch ? buildWatch : buildOnce)();
}
