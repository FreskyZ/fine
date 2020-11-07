import * as fs from 'fs';
import * as path from 'path';
import * as filesize from 'filesize';
import * as ts from 'typescript';
import * as webpack from 'webpack';
import * as webpackt from './webpack-additional';
import * as sm from 'source-map';
import { fsync } from 'fs/promises';

const rootDirectory = '<ROOTDIR>';
const basicOptions: ts.CompilerOptions = {
    lib: ['lib.es2020.d.ts'],
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    noEmitOnError: true,
    noImplicitAny: true,
};

const nodePackage = JSON.parse(fs.readFileSync('package.json', 'utf-8'));

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

async function smc() {
    console.log('merging');

    const generator = new sm.SourceMapGenerator({ file: 'server.js.2', sourceRoot: '' });
    const consumer1s: { [key: string]: sm.BasicSourceMapConsumer } = {};

    const consumer2 = await new sm.SourceMapConsumer(JSON.parse(fs.readFileSync('dist/home/server.js.map', 'utf-8')));
    consumer2.computeColumnSpans();
    const consumer2Mappings: sm.MappingItem[] = [];
    consumer2.eachMapping(m => consumer2Mappings.push(m));

    for (const { generatedLine, generatedColumn, source, originalLine, originalColumn } of consumer2Mappings) {
        if (source == null || originalLine == null || originalColumn == null) continue;

        if (!source.startsWith('webpack://fps/build/')) continue;
        const actualSource = source.slice(14); // remove 'webpack://fps/'

        const sourceFileMapFileName = actualSource + '.map';
        if (!fs.existsSync(sourceFileMapFileName)) continue;

        if (!(sourceFileMapFileName in consumer1s)) {
            consumer1s[sourceFileMapFileName] = await new sm.SourceMapConsumer(JSON.parse(fs.readFileSync(sourceFileMapFileName, 'utf-8')));
        }

        const consumer1 = consumer1s[sourceFileMapFileName];
        let { line: actualOriginalLine, column: actualOriginalColumn } = consumer1.originalPositionFor({ line: originalLine, column: originalColumn });
        if (actualOriginalLine == null || actualOriginalColumn == null) {
            const { line: actualOriginalLine2, column: actualOriginalColumn2 } = consumer1.originalPositionFor({ line: originalLine, column: originalColumn, bias: sm.SourceMapConsumer.LEAST_UPPER_BOUND });
            if (actualOriginalLine == null || actualOriginalColumn == null) continue;
            [actualOriginalLine, actualOriginalColumn] = [actualOriginalLine2, actualOriginalColumn2];
        }

        generator.addMapping({ 
            source: 'src' + actualSource.slice(5, -2) + 'ts',
            original: { line: actualOriginalLine, column: actualOriginalColumn },
            generated: { line: generatedLine, column: generatedColumn },
        });
    }

    fs.writeFileSync('dist/home/server.js.2.map', generator.toString());
    console.log('merged source map generated');
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
            sourceMap: true,
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
            target: 'node',
            externals: Object.keys(nodePackage['dependencies']).reduce((acc, p) => ({ ...acc, [p]: `commonjs ${p}` }), {}),
            devtool: 'hidden-nosources-source-map',
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
    } else if (commandLine.length == 1 && commandLine[0] == 'smc') { // source map merger test
        smc();
    } else {
        console.log('unknown command line, abort');
    }
}

main(process.argv.slice(2));
