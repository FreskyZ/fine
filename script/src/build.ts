import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import * as filesize from 'filesize';
import * as moment from 'moment';
import * as webpack from 'webpack';

// webpack loads it by name, but if not import here, tsc will ignore that file
import * as typescript_loader from './typescript-loader';

function __use(_: any) {}
__use(typescript_loader);

const projectDirectory = process.cwd();
const nodePackageContent = fs.readFileSync(path.join(projectDirectory, 'package.json'));
const nodePackage = JSON.parse(nodePackageContent.toString()) as { dependencies: string[] };

declare module 'chalk' {
    type PlaceholderType = string | number;
    interface Chalk {
        (text: TemplateStringsArray, ...placeholders: PlaceholderType[]): string;
    }
}
class Reporter {
    public constructor(public cat: string) {
    }

    public write(message: string) {
        console.log(message);
    }
    public writeWithHeader(message: string) {
        console.log(chalk`[{gray ${this.cat}@${moment().format('HH:mm:ss')}]} ${message}`);
    }
};
const reporter = new Reporter('webpack');

function webpackHandler(err: Error, stats: webpack.Stats) {
    if (err) {
        reporter.writeWithHeader(`error: ${err}`);
        // this.emit('bundle-error');
        return;
    }

    const statData = stats.toJson();
    if (stats.hasErrors()) {
        reporter.writeWithHeader(`${statData.errors.length} bundle errors`);
        for (const error of statData.errors) {
            console.error(error);
        }
        // this.emit('bundle-error');
        return;
    }
    if (stats.hasWarnings()) {
        reporter.writeWithHeader(`${statData.warnings.length} bundle warnings`);
        for (const warning of statData.warnings) {
            console.log(warning);
        }
    }

    let lastHash = '';
    const { version, hash, time, assets, chunks, modules } = statData;
    reporter.writeWithHeader(chalk`{cyan bundled} in {yellow ${time.toString()}ms}, `
        + chalk`hash {yellow ${hash}}{green ${hash == lastHash ? ' same as last' : ''}}`);

    if (hash != lastHash) {
        for (let assetIndex = 0; assetIndex < assets.length; ++assetIndex) {
            const asset = assets[assetIndex];
            console.log(chalk`{gray asset#}${assetIndex} {yellow ${asset.name}}`
                + chalk` {gray size} {yellow ${filesize(asset.size)}} {gray chunks} [${asset.chunks.join(', ')}]`);
        }

        for (const chunk of chunks) {
            console.log(chalk`{gray chunk#}${chunk.id} `
                + chalk`{yellow ${chunk.names.join(',')}} {gray size} {yellow ${filesize(chunk.size)}}`);

            let externalModules = [];
            for (let moduleIndex = 0; moduleIndex < chunk.modules.length; ++moduleIndex) {
                const module = chunk.modules[moduleIndex];
                if (!module.name.startsWith('external')) {
                    console.log(chalk`  {gray #${moduleIndex}} `
                        + chalk`${module.name} {gray size ${filesize(module.size)}}`);
                } else {
                    externalModules.push(module.name.slice(10, -1)); // pattern is 'external ".+"'
                }
            }
            console.log(chalk`  {gray +} ${externalModules.length} {gray external modules} ${externalModules.join(', ')}`);
        }

        // this.lastHash = hash;
        reporter.writeWithHeader(chalk`end of {cyan bundle stat}`);
    }

    // this.emit('bundle-success', statData);
}

webpack({
    mode: 'development',
    entry: './src/server/index.ts',
    target: 'node',
    devtool: 'source-map',
    module: {
        rules: [{
            test: /\.ts$/,
            use: [{
                loader: path.join(__dirname, 'typescript-loader'),
                options: {
                    compilerOptions: {
                        outDir: './build/server',
                    },
                },
            }],
        }],
    },
    output: {
        path: path.join(projectDirectory, 'build'),
        filename: 'server2.js',
    },
    externals: Object.keys(nodePackage.dependencies)
        .reduce((x, e) => { x[e] = 'commonjs ' + e; return x; }, {} as webpack.ExternalsObjectElement),
}, webpackHandler);

