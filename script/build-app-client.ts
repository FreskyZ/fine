/// <reference path="antd-dayjs-plugin.d.ts" />
import * as fs from 'fs';
import * as path from 'path';
import * as chalk from 'chalk';
import { admin } from './admin';
import { projectDirectory, logInfo, logError } from './common';
// import { generate } from './run-codegen';
import { TypeScriptOptions, transpile } from './run-typescript';
// import { MyPackOptions } from './run-mypack';
import { WebpackConfiguration, bundleOnce } from './run-webpack';
import { BundleAnalyzerPlugin } from 'webpack-bundle-analyzer';
import * as AntdDayjsWebpackPlugin from 'antd-dayjs-webpack-plugin';
import * as TerserPlugin from 'terser-webpack-plugin';

const getTypeScriptOptions = (app: string): TypeScriptOptions => ({
    entry: `src/${app}/client/index.tsx`,
    sourceMap: true,
    additionalLib: ['dom'],
    jsx: true,
    importDefault: true,
});
const getWebpackConfiguration = (app: string): WebpackConfiguration => ({
    mode: 'production',
    entry: path.join(projectDirectory, `build/${app}-client/index.js`),
    output: {
        filename: 'client.js',
        path: path.join(projectDirectory, `dist/${app}`),
    },
    devtool: 'source-map',
    optimization: {
        splitChunks: {
            cacheGroups: {
                antd: {
                    test: /node_modules\/(antd|rc)/,
                    priority: 20,
                    chunks: 'all',
                    filename: 'antd.js',
                },
                antdIcon: {
                    test: /node_modules\/\@ant-design/,
                    priority: 20,
                    chunks: 'all',
                    filename: 'antd-icon.js'
                },
                reactDom: {
                    test: /node_modules\/react-dom/,
                    priority: 20,
                    chunks: 'all',
                    filename: 'react-dom.js'
                },
                vender: {
                    test: /node_modules/,
                    priority: 10,
                    chunks: 'all',
                    filename: 'vendor.js',
                },
            }
        },
        minimizer: [
            new TerserPlugin({
                terserOptions: {
                    format: {
                        comments: false,
                    },
                },
                extractComments: false,
            }),
        ],
    },
    plugins: [
        new BundleAnalyzerPlugin({ 
            analyzerMode: 'static',
            openAnalyzer: false,
            reportFilename: `stat.html`,
        }),
        new AntdDayjsWebpackPlugin(),
    ]
});

async function buildOnce(app: string) {
    logInfo('mka', chalk`{yellow ${app}-client}`);
    
    // html
    logInfo('htm', chalk`copy {yellow src/${app}/index.html}`);
    await fs.promises.copyFile(`src/${app}/index.html`, `dist/${app}/index.html`);
    logInfo('htm', 'copy completed');

    // js
    transpile(getTypeScriptOptions(app), ({ afterEmit: async ({ success, files }) => {
        if (!success) {
            logError('mka', chalk`{yellow ${app}-client} failed at transpile typescript`);
            process.exit(1);
        }

        await fs.promises.writeFile(`build/${app}-client/index.js`, files.find(f => f.name == '/vbuild/index.js').content);
        await fs.promises.writeFile(`build/${app}-client/index.js.map`, files.find(f => f.name == '/vbuild/index.js.map').content);

        bundleOnce(getWebpackConfiguration(app), () => {
            logError('mka', chalk`{yellow ${app}-client} failed at bundle`);
            process.exit(1);
        }, async () => {
            await admin({ type: 'reload-static', key: app });
            logInfo('mka', `${app}-client completed successfully`);
        });
    } }));

    // // css
    // try {
    //     const code = await transpileStyle(getSassOptions(app));
    //     await fs.promises.writeFile(`dist/${app}/index.css`, code);
    // } catch {
    //     logError('mka', chalk`{yellow ${app}-client} failed at transpile stylesheet`);
    //     process.exit(1);
    // }

    // // const packResult = await pack(createMyPackOptions(app, files));
    // // if (!packResult.success) {
    // //     logError('mka', chalk`{yellow ${app}-client} failed at pack`);
    // //     process.exit(1);
    // // }
    // // await fsp.writeFile(`dist/${app}/client.js`, packResult.jsContent);
    // // await fsp.writeFile(`dist/${app}/client.js.map`, packResult.mapContent);

    // await admin({ type: 'reload-static', key: app });
    // logInfo('mka', `${app}-client completed successfully`);
}

function buildWatch(_app: string) {
}

export async function build(app: string, watch: boolean): Promise<void> {
    if (watch) {
        buildWatch(app);
    } else {
        await buildOnce(app);
    }
}