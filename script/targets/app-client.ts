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
const getWebpackConfiguration = (app: string): webpack.Configuration => ({
    mode: 'production',
    entry: path.resolve('src', app, 'client/index.js'),
    module: {           // vvv typescript emit .js not .jsx for JsxEmit.ReactJsx
        rules: [{ test: /\.js$/, exclude: /node_modules/, enforce: 'pre', use: ['source-map-loader'] }],
    },
    output: { filename: 'client.js', path: path.resolve(`dist/${app}`) },
    devtool: false,
    performance: { hints: false }, // entry point size issue is handled by cache control and initial loading placeholder not your warning
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
    cache: { 
        type: 'filesystem',
        buildDependencies: { config: [path.resolve('script/index.ts')] },
    },
    plugins: [
        new AntdDayjsWebpackPlugin(),
        new webpack.SourceMapDevToolPlugin({
            // NOTE: this plugin or the devtool option is about whether or how to put source map not whether generate source map when packing and minimizing
            // so the test/include/exclude is applied on asset name not module/chunk name
            exclude: /vendor/,
            // it seems there is no way to auto follow output file name by "[name]",etc. helpers, so directly use this
            filename: 'client.js.map',
        }),
    ],
});

const CompilationAdditionalStatKey = Symbol.for('WebpackCompilationAdditionalStatKey');
function createWebpackCompiler(app: string, files: TypeScriptResult['files']) {
    const configuration = getWebpackConfiguration(app);
    logInfo('wpk', chalk`once {yellow ${configuration.entry}}`);

    const compiler = webpack(configuration);

    // their type is very mismatch but they very can work at runtime
    (compiler as any).inputFileSystem = (new unionfs.Union() as any).use(fs)
        .use(memfs.Volume.fromJSON(files.reduce<Record<string, string>>((acc, f) => { acc[f.name] = f.content; return acc; }, {})));

    // asset source is available when emitting and discarded sometime before compile callback, so compress size calculation should be here
    // put it in compilation custom property
    compiler.hooks.emit.tap('MAKAPlugin', compilation => {
        const sizes: { [name: string]: number } = (compilation as any)[CompilationAdditionalStatKey] = {};
        for (const asset of compilation.getAssets()) {
            sizes[asset.name] = zlib.brotliCompressSync(asset.source.buffer()).length;
        }
    });

    // compiler.cache.hooks.store.tap('MakaPlugin', (identifier, etag, _data) => console.error(`store ${identifier} etag ${etag}`));
    // compiler.cache.hooks.get.tap('MakaPlugin', (identifier, etag, _gotHandlers) => console.error(`get ${identifier} etag ${etag}`));

    return compiler;
}

// for normal, print warning message and asset summary and all other things to file
// for error, only print all things to file
function printWebpackResult(statsObject: webpack.Stats) {
    const [compilation, stats] = [statsObject.compilation, statsObject.toJson() as WebpackStat];
    const reportFileName = `logs/stats-${dayjs().format('YYYYMMDD-HHmmss')}.txt`;

    const compressSizes: { [name: string]: number } = (compilation as any)[CompilationAdditionalStatKey];

    const totalAssetSize = filesize(stats.assets.reduce<number>((acc, a) => acc + a.size, 0));
    const totalCompressSize = filesize(stats.assets.reduce<number>((acc, a) => acc + compressSizes[a.name], 0));
    const [maxVendorSize, minVendorSize] = [
        filesize(stats.assets.filter(a => a.name.includes('vendor')).reduce<number>((acc, a) => Math.max(acc, compressSizes[a.name]), 0)),
        filesize(stats.assets.filter(a => a.name.includes('vendor')).reduce<number>((acc, a) => Math.min(acc, compressSizes[a.name]), 10_000_000)),
    ];

    if (stats.errorsCount == 0) {
        logInfo('wpk', chalk`completed with {yellow ${stats.assets.length}} assets in ${stats.time/1000}s`);
        logInfo('wpk', chalk`total ${totalAssetSize} compress {yellow ${totalCompressSize}} range [${minVendorSize}, ${maxVendorSize}]`);
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
        report += `asset ${asset.name} size ${filesize(asset.size)} compress ${(filesize(compressSizes[asset.name]))} chunks [${asset.chunks.join(',')}] chunkNames [${asset.chunkNames.join(',')}]\n`;
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

    fs.writeFileSync(reportFileName, report);
    return stats;
    // no human will want to read the file, even vscode don't want to syntatic parse or even lexical parse this file
    // fs.writeFileSync('logs/stats.full.json', JSON.stringify(stats, undefined, 1));
}

function renderHtmlTemplate(app: string, files: [css: string[], js: string[]]) {
    const templateEntry = `src/${app}/index.html`;
    logInfo('htm', chalk`read {yellow ${templateEntry}}`);

    const htmlTemplate = fs.readFileSync(templateEntry, 'utf-8');

    let html = htmlTemplate
        .replace('<stylesheet-placeholder />', 
            files[0].map(cssFile => `<link rel="stylesheet" type="text/css" href="/${cssFile}">`).join('\n  '))
        .replace('<script-placeholder />', 
            files[1].map(jsFile => `<script type="text/javascript" src="/${jsFile}"></script>`).join('\n  '));
    fs.writeFileSync(`dist/${app}/index.html`, html);

    logInfo('htm', 'template rendered');
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

            const compiler = createWebpackCompiler(app, files);
            compiler.run((error, statsObject): void => {
                if (error) {
                    logError('wpk', error.message);
                    return logCritical('mka', chalk`{yellow ${app}-client} failed at pack (1)`);
                }

                const stats = printWebpackResult(statsObject);
                if (stats.errorsCount > 0) {
                    return logCritical('mka', chalk`{yellow ${app}-client} failed at pack (2)`);
                }

                resolve(stats.assets.map(a => a.name));
            });
        } });
    }));

    Promise.all([packcss, packjs]).then(files => {
        renderHtmlTemplate(app, files);
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
