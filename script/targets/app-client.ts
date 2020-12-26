/// <reference path="../types/antd-dayjs-plugin.d.ts" />
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import * as AntdDayjsWebpackPlugin from 'antd-dayjs-webpack-plugin';
import * as chalk from 'chalk';
import * as dayjs from 'dayjs';
import * as filesize from 'filesize';
import * as memfs from 'memfs';
import * as TerserPlugin from 'terser-webpack-plugin';
import * as unionfs from 'unionfs';
import * as webpack from 'webpack';
import { WebpackStat } from '../types/webpack';
import { logInfo, logError, logCritical } from '../common';
import { admin } from '../tools/admin';
import { codegen } from '../tools/codegen';
import { SassOptions, sass } from '../tools/sass';
import { TypeScriptOptions, TypeScriptResult, typescript } from '../tools/typescript';
import { wswatch, wsadmin } from '../tools/wsadmin';

const getTypeScriptOptions = (app: string, watch: boolean): TypeScriptOptions => ({
    base: 'jsx',
    entry: `src/${app}/client/index.tsx`,
    sourceMap: 'normal',
    watch,
});

const getSassOptions = (app: string): SassOptions => ({
    entry: `src/${app}/client/index.sass`,
    output: `dist/${app}/index.css`,
});

// MAKA_AC_OSIZE: maka-app-client-optimize-size-level
// 0 is not minify, 1 is fast minify, 2 is full minify, default to 2
const sizeOptimizeLevel = 'MAKA_AC_OSIZE' in process.env ? (process.env['MAKA_AC_OSIZE'] === '0' ? 0 : parseInt(process.env['MAKA_AC_OSIZE']) || 2) : 2;
const getWebpackConfiguration = (app: string): webpack.Configuration => ({
    mode: 'development', // production force disable cache, so use development mode with production optimization settings
    entry: { 'client': path.resolve('src', app, 'client/index.js') },
    module: { rules: [{ test: /\.js$/, exclude: /node_modules/, enforce: 'pre', use: ['source-map-loader'] }] },
    output: { filename: 'client.js', path: path.resolve(`dist/${app}`), pathinfo: false },
    devtool: false, // use SourceMapDevToolPlugin instead of this
    cache: { type: 'filesystem', name: `maka-webpack-${app}`, cacheDirectory: path.resolve('.cache') },
    performance: { hints: false }, // entry point size issue is handled by cache control and initial loading placeholder not your warning
    optimization: {
        moduleIds: 'deterministic',
        chunkIds: 'deterministic',
        mangleExports: 'deterministic',
        nodeEnv: 'production',
        innerGraph: true,
        usedExports: true,
        emitOnErrors: false,
        flagIncludedChunks: true,
        concatenateModules: true,
        splitChunks: {
            hidePathInfo: true,
            cacheGroups: {
                // NOTE: they are manually balanced for "min max size", rebalance them if they lost balance
                '1': { test: /node_modules\/react\-dom/, priority: 20, chunks: 'all', filename: 'client-vendor1.js' },
                '2': { test: /node_modules\/(rc|\@ant-design)/, priority: 20, chunks: 'all', filename: 'client-vendor2.js' },
                '3': { test: /node_modules\/(antd|lodash)/, priority: 20, chunks: 'all', filename: 'client-vendor3.js' },
                '4': { test: /node_modules/, priority: 10, chunks: 'all', filename: 'client-vendor4.js' },
            },
        },
        minimize: sizeOptimizeLevel != 0,
        minimizer: [new TerserPlugin({ terserOptions: { 
            format: { comments: false }, 
            compress: sizeOptimizeLevel == 2,
        }, extractComments: false })],
    },
    plugins: [
        new AntdDayjsWebpackPlugin(),
        new webpack.SourceMapDevToolPlugin({
            // NOTE: this plugin or the devtool option is about whether or how to put source map not whether generate source map when packing and minimizing
            // so the test/include/exclude is applied on asset name not module/chunk name
            exclude: /vendor/,
            filename: '[name].js.map',
        }),
    ],
    // infrastructureLogging: { debug: 'webpack.cache.PackFileCacheStrategy', level: 'verbose' },
});

interface WebpackResult {
    error: Error,
    statsObject: webpack.Stats,
}
interface AdditionalStat { 
    compressSizes: { [assetName: string]: number },
}

// watching only for display
function createWebpackCompiler(app: string, mfs: any, watching: boolean): [webpack.Compiler, AdditionalStat] {
    logInfo('wpk', chalk`${watching ? 'watch' : 'once'} {yellow src/${app}/client/index.js}`);

    const compiler = webpack(getWebpackConfiguration(app));
    const additional: AdditionalStat = { compressSizes: {} };

    // their type is very mismatch but they very can work at runtime
    compiler.inputFileSystem = (new unionfs.Union() as any).use(fs).use(mfs);

    // asset source is available when emitting and discarded sometime before compile callback, so compress size calculation should be here
    // put it in compilation custom property
    compiler.hooks.emit.tap('CompressSizePlugin', compilation => {
        for (const asset of compilation.getAssets()) {
            additional.compressSizes[asset.name] = zlib.brotliCompressSync(asset.source.buffer()).length;
        }
    });

    return [compiler, additional];
}

// for normal, print warning message and asset summary and all other things to file
// for error, only print all things to file
function printWebpackResult(stats: WebpackStat, additional: AdditionalStat) {
    const reportFileName = `/tmp/maka-stats-${dayjs().format('YYYYMMDD-HHmmss')}.txt`;

    const totalAssetSize = filesize(stats.assets.reduce<number>((acc, a) => acc + a.size, 0));
    const totalCompressSize = filesize(stats.assets.reduce<number>((acc, a) => acc + additional.compressSizes[a.name], 0) || 0);
    const maxVendorSize = stats.assets.filter(a => a.name.includes('vendor')).reduce<number>((acc, a) => Math.max(acc, additional.compressSizes[a.name]), 0);

    if (stats.errorsCount == 0) {
        logInfo('wpk', chalk`completed with {yellow ${stats.assets.length}} assets in ${stats.time/1000}s, `
            + chalk`{yellow ${totalCompressSize}} ({${maxVendorSize > 300_000 ? 'red' : 'black'} max ${filesize(maxVendorSize || 0)}})`);
        if (stats.warningsCount > 0) {
            logInfo('wpk', chalk`{yellow ${stats.warningsCount}} warnings`);
            for (const { message } of stats.warnings) {
                console.log('  ' + message);
            }
        }
    } else {
        logError('wpk', chalk`completed with {red ${stats.errorsCount}} errors, stat file {yellow ${reportFileName}}`);
        for (const { message } of stats.errors) {
            logError('wpk', message);
        }
    }

    let report = '';
    const chunkFlags = ['entry', 'rendered', 'initial', 'recorded'];
    const moduleFlags = ['built', 'codeGenerated', 'cached', 'cacheable', 'optional', 'prefetched'];

    report += `hash ${stats.hash} time ${stats.time}ms total size ${totalAssetSize} (${totalCompressSize})\n`;
    if (stats.warningsCount) {
        report += `${stats.warningsCount} warnings:\n`;
        for (const warning of stats.warnings) {
            report += JSON.stringify(warning, undefined, 1) + '\n';
        }
    }
    if (stats.errorsCount) {
        report += `${stats.errorsCount} errors:\n`;
        for (const error of stats.errors) {
            report += JSON.stringify(error, undefined, 1) + '\n';
        }
    }
    for (const asset of stats.assets) {
        report += `asset ${asset.name} size ${filesize(asset.size)} compress ${(filesize(additional.compressSizes[asset.name] ?? 0))} chunks [${asset.chunks.join(',')}] chunkNames [${asset.chunkNames.join(',')}]\n`;
    }
    for (const chunk of stats.chunks) {
        report += `chunk ${chunk.id} files [${chunk.files.join(',')}] size ${filesize(chunk.size)} flags [${chunkFlags.filter(name => (chunk as any)[name]).join(',')}] ${chunk.modules.length} chunks\n`;
        for (const $module of chunk.modules) {
            report += `  module ${$module.id} size ${filesize($module.size)} flags [${moduleFlags.filter(name => ($module as any)[name]).join(',')}] name "${$module.name}" identifier "${$module.identifier}"\n`;
            if (/\+ \d+ modules/.test($module.name) && $module.modules) { // concated modules
                for (const submodule of $module.modules) {
                    report += `    submodule ${submodule.name} size ${filesize(submodule.size)}\n`;
                }
            }
        }
    }

    fs.writeFileSync(reportFileName, report);
    // no human will want to read the file, even vscode don't want to syntatic parse or even lexical parse this file
    // fs.writeFileSync('stats.full.json', JSON.stringify(stats, undefined, 1));
}

// see TypeScriptChecker.watch, cleanup unused modules
function cleanupMemoryFile(stats: WebpackStat, files: TypeScriptResult['files'], mfs: memfs.IFs) {
    // this is used js file absolute path, the files parameter contains js/map file absolute path
    const mycodeModules: string[] = [];
    const mycodePrefix = path.resolve('src');
    for (const $module of stats.modules) {
        if (/\+ \d+ modules/.test($module.name) && $module.modules) {
            for (const submodule of $module.modules) {
                const fullpath = path.resolve(submodule.name);
                if (fullpath.startsWith(mycodePrefix)) {
                    mycodeModules.push(fullpath);
                }
            }
        } else {
            const fullpath = path.resolve($module.name);
            if (fullpath.startsWith(mycodePrefix)) {
                mycodeModules.push(fullpath);
            }
        }
    }

    const unusedFiles = files.filter(f => !mycodeModules.includes(f.name) && !mycodeModules.some(m => m + '.map' == f.name));
    for (const unusedFile of unusedFiles) {
        files.splice(files.indexOf(unusedFile), 1);
        mfs.unlinkSync(unusedFile.name);
        if (!unusedFile.name.endsWith('.map')) {
            console.log(chalk`   {gray - ${unusedFile.name}}`);
        }
    }
}

// watching only means less info
async function renderHtmlTemplate(app: string, files: [css: string[], js: string[]], watching: boolean) {
    const templateEntry = `src/${app}/index.html`;
    if (!watching) {
        logInfo('htm', chalk`read {yellow ${templateEntry}}`);
    }
    const htmlTemplate = await fs.promises.readFile(templateEntry, 'utf-8');

    let html = htmlTemplate
        .replace('<stylesheet-placeholder />', files[0].map(cssFile => `<link rel="stylesheet" type="text/css" href="/${cssFile}">`).join('\n  '))
        .replace('<script-placeholder />', files[1].map(jsFile => `<script type="text/javascript" src="/${jsFile}"></script>`).join('\n  '));

    await fs.promises.writeFile(`dist/${app}/index.html`, html);
    logInfo('htm', 'template rendered');
}

async function buildOnce(app: string) {
    logInfo('mka', chalk`{cyan ${app}-client}`);
    fs.mkdirSync(`dist/${app}`, { recursive: true });

    // promise 1: fcg -> tsc -> wpk, return js file list
    const p1 = (async (): Promise<string[]> => {
        const generator = codegen(app, 'client');
        if (fs.existsSync(generator.definitionFile)) {
            const generateResult = await generator.generate();
            if (!generateResult.success) {
                return logCritical('mka', chalk`{cyan ${app}-client} failed at codegen`);
            }
        }

        const checkResult = typescript(getTypeScriptOptions(app, false)).check();
        if (!checkResult.success) {
            return logCritical('mka', chalk`{cyan ${app}-client} failed at check`);
        }
        
        // their type is very mismatch but they very can work at runtime
        const mfs = memfs.Volume.fromJSON(checkResult.files.reduce<Record<string, string>>((acc, f) => { acc[f.name] = f.content; return acc; }, {}));
        const [compiler, additional] = createWebpackCompiler(app, mfs, false);
        const packResult = await new Promise<WebpackResult>(resolve => compiler.run((error, statsObject) => resolve({ error, statsObject })));
        if (packResult.error) {
            logError('wpk', JSON.stringify(packResult.error, undefined, 1));
            return logCritical('mka', chalk`{yellow ${app}-client} failed at pack (1)`);
        }
        const stats = packResult.statsObject.toJson() as WebpackStat;

        printWebpackResult(stats, additional);
        if (stats.errorsCount > 0) {
            return logCritical('mka', chalk`{cyan ${app}-client} failed at pack (2)`);
        }

        // ATTENTION: this is essential for persist cache because this triggers cached items to actually write to file
        // // the relationship between them is not described clearly in their own document
        compiler.close((error) => {
            if (error) {
                logError('wpk', `failed to close compiler: ${JSON.stringify(error)}`);
                // print error and ignore
            }
        });
        return stats.assets.map(a => a.name);
    })();

    // promise 2: css, return css file list
    const p2 = (async (): Promise<string[]> => {
        const transpileResult = await sass(getSassOptions(app)).transpile();
        if (!transpileResult) {
            return logCritical('mka', chalk`{cyan ${app}-client} failed at transpile`);
        }
        return ['index.css'];
    })();

    await renderHtmlTemplate(app, await Promise.all([p2, p1]), false);
    await admin({ type: 'reload-static', key: app });
    logInfo('mka', chalk`{cyan ${app}-client} complete successfully`);
}

function buildWatch(app: string) {
    logInfo('mka', chalk`watch {cyan ${app}-client}`);
    fs.mkdirSync(`dist/${app}`, { recursive: true });

    let rerenderRequested = false;

    const generator = codegen(app, 'client');
    if (fs.existsSync(generator.definitionFile)) {
        generator.watch(); // no callback watch is this simple
    }
 
    const mfs = new memfs.Volume();
    const [compiler, additional] = createWebpackCompiler(app, mfs, true);

    // Attention: this is *the* array inside TypeScriptChecker.watch, to be clean up by webpack result
    let typescriptResultFiles: TypeScriptResult['files'] = [];
    let webpackResultFiles: string[] = [];
    let webpackResultHash: string = null; // last hash
    typescript(getTypeScriptOptions(app, true)).watch(async ({ files }) => {
        // no need to delete file here because it will not happen in typescript write file hook while correct delete file happen in cleanupMemoryFile
        for (const { name: fileName, content: fileContent } of files) {
            if (!mfs.existsSync(fileName) && !fileName.endsWith('.map')) {
                console.log(chalk`   + ${fileName}`);
            }
            await mfs.promises.mkdir(path.dirname(fileName), { recursive: true });
            await mfs.promises.writeFile(fileName, fileContent);
        }
        typescriptResultFiles = files;

        // use compiler.run instead of compiler.watch because 
        // webpack seems to be very unstable watching in memory file system 
        // and output message order is a mess and I cannot figure out what happens
        logInfo('wpk', 'repack');
        compiler.run((error, statsObject) => {
            if (error) {
                logError('wpk', JSON.stringify(error, undefined, 1));
                return;
            }
            const stats = statsObject.toJson() as WebpackStat;
        
            printWebpackResult(stats, additional);
            cleanupMemoryFile(stats, typescriptResultFiles, mfs as memfs.IFs); // this writer still cannot write his type clearly, again
    
            if (stats.errorsCount != 0) { return; }
    
            if (stats.hash != webpackResultHash) {
                webpackResultFiles = stats.assets.map(a => a.name);
                webpackResultHash = stats.hash;
                rerenderRequested = true;
            } else {
                logInfo('wpk', chalk`completed with {blue no change}`);
            }
            
            // see buildOnce compiler.close
            compiler.close((error) => {
                if (error) {
                    logError('wpk', `failed to close compiler: ${JSON.stringify(error)}`);
                    // print error and ignore
                }
            });
        })
    });

    let cssFiles = ['index.css'];
    sass(getSassOptions(app)).watch(() => {
        // css file list will not change, for now
        rerenderRequested = true;
    });

    setInterval(() => {
        if (rerenderRequested) {
            rerenderRequested = false;
            renderHtmlTemplate(app, [cssFiles, webpackResultFiles.concat(['x/x.js'])], true).then(() => {
                admin({ type: 'reload-static', key: app }).catch(() => { /* ignore */});
                // always reconfig devmod in case server-core restarted, this also refreshes disable timer
                admin({ type: 'config-devmod', sourceMap: true, websocketPort: port }).catch(() => { /* ignore */});
                wsadmin('refresh');
            });
        }
    }, 3003);

    const port = Math.floor(Math.random() * 98 + 8001); // random between 8001~8099 // lazy to investigate whether include in this expression and in cloud service security setup
    wswatch(port);
}

export function build(app: string, watch: boolean) {
    (watch ? buildWatch : buildOnce)(app);
}
