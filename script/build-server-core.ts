import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as chalk from 'chalk';
import { projectDirectory, nodePackage, logInfo, logError } from './common';
import { admin } from './admin-base';
import { TypeScriptCompilerOptions, transpileOnce, transpileWatch } from './run-typescript';
import { WebpackConfiguration, bundleWatch } from './run-webpack';
import { MyPackOptions, bundleOnce } from './run-mypack';
import { mergeSourceMap } from './run-sourcemap';

const typescriptEntry = 'src/server-core/index.ts';
const typescriptOptions:TypeScriptCompilerOptions = {
    sourceMap: true,
    outDir: '/vbuild',
};

const mypackOptions: MyPackOptions = {
    entry: '/vbuild/server-core/index.js',
    files: [],
    sourceMap: true,
    output: 'dist/home/server.js',
    printModules: true,
    minify: false,
}

const webpackConfiguration: WebpackConfiguration = {
    mode: 'development',
    entry: path.join(projectDirectory, 'build/server-core/index.js'),
    output: {
        filename: 'server.js',
        path: path.join(projectDirectory, 'dist/home'),
    },
    target: 'node',
    externals: Object.keys(nodePackage['dependencies'])
        .concat(['dayjs/plugin/utc'])
        .reduce((acc, p) => ({ ...acc, [p]: `commonjs ${p}` }), {}),
    devtool: 'hidden-nosources-source-map',
};

const sourcemapEntry = 'dist/home/server.js.map';

async function buildOnce() {
    logInfo('mka', chalk`{yellow server-core}`);

    const files: MyPackOptions['files'] = [];
    if (!transpileOnce(typescriptEntry, { ...typescriptOptions, 
        writeFileHook: (name: string, content: string) => { files.push({ name, content }); } } as unknown as TypeScriptCompilerOptions)) {
        logError('mka', chalk`{yellow server-core} failed at transpile typescript`);
        process.exit(1);
    }

    const [resultJs, resultMap] = await bundleOnce({ ...mypackOptions, files });
    if (!resultJs) {
        logError('mka', chalk`{yellow server-core} failed at bundle`);
        process.exit(1);
    }

    await fs.writeFile('build/server.js', resultJs);
    await fs.writeFile('build/server.js.map', resultMap);

    logInfo('mka', 'server-core completed successfully');
}

// only watch server-core require restart server process
let serverProcess: ChildProcessWithoutNullStreams = null;
function startOrRestartServer() {
    function start() {
        // mds: my dev server
        console.log('[mds] starting server process');
        serverProcess = spawn('node', ['dist/home/server.js']);
        
        serverProcess.stdout.pipe(process.stdout);
        serverProcess.stderr.pipe(process.stderr);
        serverProcess.on('error', error => console.log(`[mds] server process error ${error.message}`));
        serverProcess.on('exit', code => { console.log(`[mds] server process exited with code ${code}`); serverProcess = null; });
    }

    if (serverProcess != null) {
        console.log(`[mds] shutdown previous server process ${serverProcess.pid}`);
        serverProcess.once('exit', start);
        admin({ type: 'shutdown' });
    } else {
        start();
    }
}

function buildWatch() {
    console.log(chalk`[mka] watch {yellow server-core}`);

    process.on('exit', () => serverProcess.kill()); // make sure

    transpileWatch(typescriptEntry, typescriptOptions);
    bundleWatch(webpackConfiguration, () => {
        mergeSourceMap(sourcemapEntry, true).then(() => {
            startOrRestartServer();
        }); // fail is not expected and let it terminate process
    });
}

export async function build(watch: boolean): Promise<void> {
    if (watch) {
        buildWatch();
    } else {
        buildOnce();
    }
}
