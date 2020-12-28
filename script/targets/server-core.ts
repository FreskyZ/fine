import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as chalk from 'chalk';
import * as SFTPClient from 'ssh2-sftp-client';
import { logInfo, logError, logCritical } from '../common';
import { admin } from '../tools/admin';
import { TypeScriptOptions, typescript } from '../tools/typescript';
import { MyPackOptions, mypack } from '../tools/mypack';

const getTypescriptOptions = (watch: boolean): TypeScriptOptions => ({
    base: 'normal',
    entry: 'src/server-core/index.ts',
    sourceMap: 'hide',
    watch,
});

const getMyPackOptions = (files: MyPackOptions['files']): MyPackOptions => ({
    type: 'app',
    files,
    entry: '/vbuild/server-core/index.js',
    sourceMap: true,
    output: 'dist/main/server.js',
    printModules: true,
    minify: true,
});

async function buildOnce(): Promise<void> {
    logInfo('mka', chalk`{cyan server-core}`);
    await fs.promises.mkdir('dist/main', { recursive: true });

    const checkResult = typescript(getTypescriptOptions(false)).check();
    if (!checkResult.success) {
        return logCritical('mka', chalk`{cyan server-core} failed at check`);
    }

    const packResult = await mypack(getMyPackOptions(checkResult.files)).run();
    if (!packResult.success) {
        return logCritical('mka', chalk`{cyan server-core} failed at pack`);
    }

    try {
        logInfo('ssh', 'deploy assets');
        const sftp = new SFTPClient();
        await sftp.connect({ host: 'domain.com', username: 'root', privateKey: await fs.promises.readFile('SSH_KEY'), passphrase: 'SSH_PASSPHRASE' });
        await sftp.fastPut(path.resolve(`dist/main/server.js`), `WEBROOT/main/server.js`);
        await sftp.fastPut(path.resolve(`dist/main/server.js.map`), `WEBROOT/main/server.js.map`);
        await sftp.end();
        logInfo('ssh', 'completed successfully');
    } catch (ex) {
        console.log(ex);
        logCritical('ssh', 'failed to connect or put file, try later');
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

    const packer = mypack(getMyPackOptions(null));
    typescript(getTypescriptOptions(true)).watch(async ({ files }) => {
        packer.options.files = files;
        const packResult = await packer.run();
        if (!packResult.success) {
            return;
        }
        if (packResult.hasChange) {
            startOrRestartServer();
        }
    });
}

export function build(watch: boolean) {
    (watch ? buildWatch : buildOnce)();
}
