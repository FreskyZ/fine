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
import { generate } from '../tools/codegen';
import { SassOptions, transpile as transpileStyle } from '../tools/sass';
import { TypeScriptOptions, TypeScriptResult, transpile as transpileScript } from '../tools/typescript';

const getTypeScriptOptions = (app: string, watch: boolean): TypeScriptOptions => ({
    base: 'jsx',
    entry: `src/${app}/client/index.tsx`,
    sourceMap: 'normal',
    watch,
});

const getSassOptions = (app: string): SassOptions => ({
    file: `src/${app}/client/index.sass`,
    outputStyle: 'compressed',
});

// MAKA_AC_OSIZE: maka-app-client-optimize-size-level
// 0 is not minify, 1 is fast minify, 2 is full minify, default to 2
const sizeOptimizeLevel = 'MAKA_AC_OSIZE' in process.env ? (process.env['MAKA_AC_OSIZE'] === '0' ? 0 : parseInt(process.env['MAKA_AC_OSIZE']) || 2) : 2;
const getWebpackConfiguration = (app: string, watch: boolean): webpack.Configuration => ({
    mode: 'production',
    watch,
    entry: path.resolve('src', app, 'client/index.js'),
    module: {           // vvv typescript emit .js not .jsx for JsxEmit.ReactJsx
        rules: [{ test: /\.js$/, enforce: 'pre', use: ['source-map-loader'] }],
    },
    output: { filename: 'client.js', path: path.resolve(`dist/${app}`) },
    devtool: 'source-map',
    performance: { hints: false }, // entry point size issue is handled by cache control and initial loading placeholder not your warning
    cache: { type: 'filesystem', store: 'pack', cacheDirectory: path.resolve('.cache'), name: `${app}-client-webpack-cache` },
    optimization: {
        emitOnErrors: false,
        splitChunks: {
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
    ],
});

function createInMemoryFileSystem(files: TypeScriptResult['files']) {
    const volumn = new memfs.Volume();
    volumn.fromJSON(files.reduce<Record<string, string>>((acc, f) => { acc[f.name] = f.content; return acc; }, {}));
    
    const ufs = new unionfs.Union();
    (ufs.use(fs) as any).use(volumn); // their type is mismatch but can work at runtime
    return ufs;
}

// for normal, print warning message and asset summary and all other things to file
// for error, only print all things to file
function printStats(stats: WebpackStat) {
    const statFileName = `logs/stats-${dayjs().format('YYYYMMDD-HHmmss')}.txt`;

    const totalAssetSize = filesize(stats.assets.reduce<number>((acc, a) => acc + a.size, 0));
    const totalCompressSize = filesize(stats.assets.reduce<number>((acc, a) => acc + a.compressSize.br, 0));
    const [maxVendorSize, minVendorSize] = [
        stats.assets.filter(a => a.name.includes('vendor')).reduce<number>((acc, a) => Math.max(acc, a.size), 0),
        stats.assets.filter(a => a.name.includes('vendor')).reduce<number>((acc, a) => Math.min(acc, a.size), 10_000_000),
    ];

    if (stats.errorsCount == 0) {
        logInfo('wpk', chalk`completed with {yellow ${stats.assets.length}} assets in ${stats.time/1000}s`);
        logInfo('wpk', chalk`total ${totalAssetSize} compress {yellow ${totalCompressSize}} range [${filesize(minVendorSize)}, ${filesize(maxVendorSize)}]`);
        if (stats.warningsCount > 0) {
            logInfo('wpk', chalk`{yellow ${stats.warningsCount}} warnings`);
            for (const { message } of stats.warnings) {
                console.log('  ' + message);
            }
        }
    } else {
        logError('wpk', chalk`completed with {red ${stats.errorsCount}} errors, stat file {yellow ${statFileName}}`);
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
        const compressSizes = `gzip: ${filesize(asset.compressSize.gzip)} deflate: ${filesize(asset.compressSize.deflate)} br: ${filesize(asset.compressSize.br)}`;
        report += `asset ${asset.name} size ${filesize(asset.size)} (${compressSizes}) chunks [${asset.chunks.join(',')}] chunkNames [${asset.chunkNames.join(',')}]\n`;
    }
    for (const chunk of stats.chunks) {
        report += `chunk ${chunk.id} files [${chunk.files.join(',')}] size ${filesize(chunk.size)} flags [${chunkFlags.filter(name => (chunk as any)[name]).join(',')}] ${chunk.modules.length} chunks\n`;
        for (const $module of chunk.modules) {
            report += `  module ${$module.id} size ${filesize($module.size)} flags [${moduleFlags.filter(name => ($module as any)[name]).join(',')}] name "${$module.name}" identifier "${$module.identifier}"\n`;
            if (/\+ \d+ modules/.test($module.name) && $module.modules) {
                for (const submodule of $module.modules) {
                    report += `    submodule ${submodule.name} size ${filesize(submodule.size)}\n`;
                }
            }
        }
    }

    fs.writeFileSync(statFileName, report);
    // no human will want to read the file, even vscode don't want to syntatic parse or even lexical parse this file
    // fs.writeFileSync('logs/stats.full.json', JSON.stringify(stats, undefined, 1));
}

function excludeSourceMap(app: string, stats: WebpackStat) {
    // NOTE: exclude source maps for vendor
    // 1. Configuration.devtool does not have include/exclude option
    // 2. webpack.SourceMapDevToolPlugin itself completely don't understand how to use its include/exclude option, especially when using optimization.splitChunks
    // 3. TerserWebpackPlugin says it respects Configuration.devtool while its source code seems not getting this option, while SourceMapDevToolPlugin cannot work also cannot proof TerserWebpackPlugin can work
    // 4. terser source map option does not have include/exclude option, also terser source map option seems to be ignored by TerserWebpackPlugin
    // 5. google result will correctly find split chunk/no vendor source map result and copies and copies of copies, but not any these 2 questions combined
    // concolusion is simply delete the source map file and remove the source mapping url line from vendors js
    //    this seems to waste source map generating time, but it actually do not take much time compared to minify
    // by the way because vendor js content is loaded for change, calculate their gzip size by they way for reporting stat
    // by the way^2 entry js is very small so load it for calculating gzip size too

    for (const asset of stats.assets) {
        const filename = `dist/${app}/${asset.name}`;
        const binaryContent = fs.readFileSync(filename);

        asset.compressSize = { 
            gzip: zlib.gzipSync(binaryContent).length, 
            deflate: zlib.deflateSync(binaryContent).length, 
            br: zlib.brotliCompressSync(binaryContent).length,
        };

        if (asset.name.includes('vendor')) {
            const textContent = binaryContent.toString('utf-8');
            const match = /\/\/#\s*sourceMappingURL/.exec(textContent);
            const newTextContent = textContent.slice(0, match.index); // this exactly make the LF before source mapping URL the LF before EOF
            fs.writeFileSync(filename, newTextContent);
            asset.size = newTextContent.length;

            const mapFileName = `dist/${app}/${asset.name}.map`;
            if (fs.existsSync(mapFileName)) { fs.unlinkSync(mapFileName); }
        }
    }
}

async function buildOnce(app: string) {
    logInfo('mka', chalk`{yellow ${app}-client}`);
    fs.mkdirSync(`dist/${app}`, { recursive: true });
    // dependency: fcg -> tsc -> wpk; wpk + css -> htm -> adm

    const codegen = fs.existsSync(`src/${app}/api.xml`) ? generate(app, 'client').then((success): void => {
        if (!success) {
            return logCritical('mka', chalk`{yellow ${app}-client} failed at code generation`);
        }
    }) : Promise.resolve();

    const packcss = transpileStyle(getSassOptions(app)).then(({ success, style }) => {
        if (!success) {
            return logCritical('mka', chalk`{yellow ${app}-client} failed at transpile style`);
        }
        fs.writeFileSync(`dist/${app}/index.css`, style);
        return ['index.css'];
    });

    // if promise(a).then fullfill handler returns a promise(b), the next .then on promise(a) will receive result of promise(b) include fullfilled/rejected
    // failures directly exit(1) for once, so no need to reject
    const packjs = codegen.then(() => new Promise<string[]>(resolve => {
        transpileScript(getTypeScriptOptions(app, false), { afterEmit: ({ success, files }): void => {
            if (!success) {
                return logCritical('mka', chalk`{yellow ${app}-client} failed at transpile script`);
            }

            const configuration = getWebpackConfiguration(app, false);
            logInfo('wpk', chalk`once {yellow ${configuration.entry}}`);

            const mfs = createInMemoryFileSystem(files);
            const compiler = webpack(configuration);

            (compiler.inputFileSystem as any) = mfs; // their type is mismatch but can work at runtime

            compiler.run((error, statsObject): void => {
                if (error) {
                    logError('wpk', error.message);
                    return logCritical('mka', chalk`{yellow ${app}-client} failed at pack (1)`);
                }
                logInfo('wpk', 'finalizing'); // in case toJson/excludeSourceMap take too long time, use this to indicate that

                const stats = statsObject.toJson() as WebpackStat;
                excludeSourceMap(app, stats);
                printStats(stats);
                if (stats.errorsCount > 0) {
                    return logCritical('mka', chalk`{yellow ${app}-client} failed at pack (2)`);
                }
                resolve(stats.assets.map(a => a.name));
            });
        } });
    }));

    Promise.all([packcss, packjs]).then(([cssFiles, jsFiles]) => {
        const templateEntry = `src/${app}/index.html`;
        logInfo('htm', chalk`read {yellow ${templateEntry}}`);
        const htmlTemplate = fs.readFileSync(templateEntry, 'utf-8');

        let html = htmlTemplate
            .replace('<stylesheet-placeholder />', 
                cssFiles.map(cssFile => `<link rel="stylesheet" type="text/css" href="/${cssFile}">`).join('\n  '))
            .replace('<script-placeholder />', 
                jsFiles.map(jsFile => `<script type="text/javascript" src="/${jsFile}"></script>`).join('\n  '));
        fs.writeFileSync(`dist/${app}/index.html`, html);
        logInfo('htm', 'template rendered');

        admin({ type: 'reload-static', key: app }).then(() => {
            logInfo('mka', `${app}-client complete successfully`);
        });
    });
}

export function build(app: string, _watch: boolean) {
    buildOnce(app);
}

// TODO
// try cache in production, or else copy production settings in development
// watch
