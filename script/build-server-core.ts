import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as fs from 'fs/promises';
import * as chalk from 'chalk';
import { logInfo, logError, compileTimeConfig } from './common';
import { admin } from './admin';
import { TypeScriptCompilerOptions, transpileOnce, transpileWatch } from './run-typescript';
import { MyPackOptions, MyPackResult, pack } from './run-mypack';

const typescriptEntry = 'src/server-core/index.ts';
const typescriptOptions = {
    sourceMap: true,
    outDir: '/vbuild',
    readFileHook: (fileName, originalReadFile) => {
        let content = originalReadFile(fileName);
        if (!fileName.endsWith('.d.ts')) {
            for (const configName in compileTimeConfig) {
                content = content.split(configName).join(compileTimeConfig[configName]);
            }
        }
        return content;
    },
    watchReadFileHook: (fileName, encoding, originalReadFile) => {
        let content = originalReadFile(fileName, encoding);
        if (!fileName.endsWith('.d.ts')) {
            for (const configName in compileTimeConfig) {
                content = content.split(configName).join(compileTimeConfig[configName]);
            }
        }
        return content;
    },
} as TypeScriptCompilerOptions;
const mypackOptions: MyPackOptions = {
    type: 'app',
    entry: '/vbuild/server-core/index.js',
    files: [],
    sourceMap: true,
    output: 'dist/home/server.js',
    printModules: true,
    minify: false,
}

async function buildOnce() {
    logInfo('mka', chalk`{yellow server-core}`);

    const files: MyPackOptions['files'] = [];
    if (!transpileOnce(typescriptEntry, { ...typescriptOptions, 
        writeFileHook: (name: string, content: string) => files.push({ name, content }),
    } as unknown as TypeScriptCompilerOptions)) {
        logError('mka', chalk`{yellow server-core} failed at transpile typescript`);
        process.exit(1);
    }

    const packResult = await pack({ ...mypackOptions, files });
    if (!packResult.success) {
        logError('mka', chalk`{yellow server-core} failed at pack`);
        process.exit(1);
    }

    await fs.writeFile('dist/home/server.js', packResult.jsContent);
    await fs.writeFile('dist/home/server.js.map', packResult.mapContent);

    logInfo('mka', 'server-core completed successfully');
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

    const files: MyPackOptions['files'] = [];
    let lastResult: MyPackResult = null;

    transpileWatch(typescriptEntry, { 
        ...typescriptOptions,
        watchWriteFileHook: (name: string, content: string) => {
            const existIndex = files.findIndex(f => f.name == name);
            if (existIndex >= 0) {
                files.splice(existIndex, 1, { name, content });
            } else {
                files.push({ name, content });
            }
        },
        watchEmit: async () => {
            const currentResult = await pack({ ...mypackOptions, files, lastResult });
            if (currentResult.success) {
                await fs.writeFile('dist/home/server.js', currentResult.jsContent);
                await fs.writeFile('dist/home/server.js.map', currentResult.mapContent);
            }

            if (currentResult.hash != lastResult?.hash) {
                startOrRestartServer();
            }
            lastResult = currentResult;
        },
    } as unknown as TypeScriptCompilerOptions);
}

export async function build(watch: boolean): Promise<void> {
    if (watch) {
        buildWatch();
    } else {
        await buildOnce();
    }
}
