import * as path from 'path';
import { projectDirectory, nodePackage } from './build';
import * as ts from './run-typescript';
import * as wp from './run-webpack';
import * as sm from './run-source-map';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default async function run(_watch: boolean): Promise<void> {
    console.log('[bud] building server-core');

    if (!ts.compile('src/server-core/index.ts', {
        sourceMap: true,
        outDir: 'build/server-core',
    })) {
        console.log('[bud] build server-core failed at transpiling.');
        return;
    }

    try {
        await wp.run({
            mode: 'development',
            entry: path.join(projectDirectory, 'build/server-core/index.js'),
            output: {
                filename: 'server.js',
                path: path.join(projectDirectory, 'dist/home'),
            },
            target: 'node',
            externals: Object.keys(nodePackage['dependencies']).reduce((acc, p) => ({ ...acc, [p]: `commonjs ${p}` }), {}),
            devtool: 'hidden-nosources-source-map',
        });
    } catch {
        console.log('[bud] build server-core failed at bundling.');
        return;
    }

    await sm.merge('dist/home/server.js.map');
    
    console.log('[bud] build server-core completed successfully.');   
}
