import path from 'path';
import filesize from 'filesize';
import ts from 'typescript';
import webpack from 'webpack';
import * as webpackt from './webpack-additional';

const rootDirectory = '<ROOTDIR>';
const basicOptions: ts.CompilerOptions = {
    lib: ['lib.es2020.d.ts'],
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ES2020,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    allowSyntheticDefaultImports: true,
    noEmitOnError: true,
    noImplicitAny: true,
};

function tsc(entry: string, options: ts.CompilerOptions) {
    const program = ts.createProgram([entry], options);
    const emitResult = program.emit();

    for (const diagnostic of ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics)) {
        const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
        if (diagnostic.file) {
            const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
            console.log(`[E${diagnostic.code}] ${diagnostic.file.fileName} at ${line + 1}:${character + 1}: ${message}`);
        } else {
            console.log(`[E${diagnostic.code}] ${message}`);
        }
    }
    return emitResult;
}

function main(commandLine: string[]) {
    if (commandLine.length == 1 && commandLine.includes('self')) {
        // "build-bootstrap": "tsc script/src/build.ts --outDir script --lib ES2020 --target ES2020 --module ES2020 --moduleResolution node --allowSyntheticDefaultImports true",
        const result = tsc(path.join(rootDirectory, 'script/src/build.ts'), {
            ...basicOptions,
            types: ["node"],
            outDir: path.join(rootDirectory, 'script'),
        });
        if (result.emitSkipped) {
            console.log('build self completed with error.');
        } else {
            console.log('build self completed successfully.');
        }
    } else if (commandLine.length <= 2 && commandLine.includes('server-core')) { // .includes implifies length > 0

        // tsc
        const result = tsc(path.join(rootDirectory, 'src/server-core/index.ts'), {
            ...basicOptions,
            outDir: path.join(rootDirectory, 'build/server-core'),
        });
        if (result.emitSkipped) {
            console.log('[tsc] completed with error');
            return;
        } else {
            console.log('[build] src/server-core/index.js => build/server-core/index.js completed');
        }

        // webpack
        const compiler = webpack({
            mode: 'development',
            entry: path.join(rootDirectory, 'build/server-core/index.js'),
            output: {
                filename: 'server.js',
                path: path.join(rootDirectory, 'dist/home'),
            },
            externals: ['express', 'fs', 'http', 'https'],
            optimization: {
                minimize: false,
            },
            devtool: 'cheap-source-map',
        });
        compiler.run((error, stat) => {
            if (error) {
                console.log('[webpack] error: ' + error.message);
                return;
            }

            const statData = stat.toJson() as webpackt.ToJsonOutput;
            console.log(`[webpack] ${statData.time}ms ${statData.hash}`);
            for (const error of statData.errors) {
                console.error(`[webpack] error: ${error.message}`);
            }
            for (const warning of statData.warnings) {
                console.error(`[webpack] warning: ${warning}`);
            }
            for (let assetIndex = 0; assetIndex < statData.assets.length; ++assetIndex) {
                const asset = statData.assets[assetIndex];
                console.log(`asset#${assetIndex} ${asset.name} size ${filesize(asset.size)} chunks [${asset.chunks.join(', ')}]`);
            }
            for (const chunk of statData.chunks) {
                console.log(`chunk#${chunk.id} ${chunk.names.join(',')} size ${filesize(chunk.size)}`);
                let webpackRuntimeCount = 0;
                let externalModules = [];
                for (let moduleIndex = 0; moduleIndex < chunk.modules.length; ++moduleIndex) {
                    const module = chunk.modules[moduleIndex];
                    if (module.name.startsWith('webpack')) {
                        webpackRuntimeCount += 1;
                    } else if (module.name.startsWith('external')) {
                        externalModules.push(module.name.slice(10, -1)); // pattern is 'external ".+"'
                    } else {
                        console.log(`  #${moduleIndex} ${module.name} size ${filesize(module.size)}`);
                    }
                }
                console.log(`  + ${webpackRuntimeCount} webpack runtime modules`);
                console.log(`  + ${externalModules.length} external modules [${externalModules.join(', ')}]`);
            }
            console.log('[build] build/server-core/index.js => dist/home/server.js completed');
        });
    } else {
        console.log('unknown command line, abort');
    }
}

main(process.argv.slice(2));
