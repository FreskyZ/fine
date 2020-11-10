import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as path from 'path';
import * as ts from 'typescript';
import * as wp from 'webpack';
import { projectDirectory, nodePackage } from './common';
import * as rts from './run-typescript';
import * as rwp from './run-webpack';
import * as rsm from './run-sourcemap';

const typescriptEntry = 'src/server-core/index.ts';
const typescriptOptions: ts.CompilerOptions = {
    sourceMap: true,
    outDir: 'build/server-core',
};

const webpackConfiguration: wp.Configuration = {
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

function buildOnce() {
    console.log(`[bud] building server-core`);

    if (!rts.compile(typescriptEntry, typescriptOptions)) {
        console.log('[bud] build server-core failed at transpiling');
        return;
    }

    rwp.run(webpackConfiguration, () => {
        console.log('[bud] build server-core failed at bundling');
    }, () => {
        rsm.merge(sourcemapEntry, false).then(() => {
            console.log('[bud] build server-core completed successfully');
        }); // fail is not expected and let it terminate process
    });
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
        serverProcess.on('exit', code => console.log(`[mds] server process exited with code ${code}`));
    }

    if (serverProcess != null) {
        console.log(`[mds] killing previous server process ${serverProcess.pid}`);
        serverProcess.once('exit', start);
        serverProcess.kill('SIGINT');
        serverProcess = null; // do not send duplicate SIGINT
    } else {
        start();
    }
}

function buildWatch() {
    console.log(`[bud] building watching server-core`);

    process.on('exit', () => serverProcess.kill()); // make sure

    rts.watch(typescriptEntry, typescriptOptions);
    rwp.watch(webpackConfiguration, () => {
        rsm.merge(sourcemapEntry, true).then(() => {
            startOrRestartServer();
        }); // fail is not expected and let it terminate process
    });
}

export default async function run(watch: boolean): Promise<void> {
    if (watch) {
        buildWatch();
    } else {
        buildOnce();
    }
}
