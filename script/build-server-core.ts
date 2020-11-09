import { exec, ChildProcess } from 'child_process';
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

export default async function run(watch: boolean): Promise<void> {
    console.log(`[bud] building${watch ? ' watching' : ''} server-core`);

    if (!watch) {
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
    } else {
        let childProcess: ChildProcess = null;

        rts.watch(typescriptEntry, typescriptOptions);
        rwp.watch(webpackConfiguration, () => {
            rsm.merge(sourcemapEntry, true).then(() => {
                if (childProcess != null) {
                    childProcess.kill('SIGINT');
                    childProcess = null;
                }

                // TODO change to spawn and display stdout
                childProcess = exec('node dist/home/server.js', { 
                    cwd: process.cwd(),
                    shell: '/usr/bin/zsh',
                    killSignal: 'SIGINT',
                }, (error) => {
                    if (error) {
                        console.log('[bud] failed to start server process: ', error);
                    } else {
                        console.log('[bud] server process restarted');
                    }
                });
            });
        });
    }
}
