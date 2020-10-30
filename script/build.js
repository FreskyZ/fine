"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const path = require("path");
const chalk_1 = require("chalk");
const filesize = require("filesize");
const moment = require("moment");
const webpack = require("webpack");
// webpack loads it by name, but if not import here, tsc will ignore that file
const typescript_loader = require("./typescript-loader");
function __use(_) { }
__use(typescript_loader);
const projectDirectory = process.cwd();
const nodePackageContent = fs.readFileSync(path.join(projectDirectory, 'package.json'));
const nodePackage = JSON.parse(nodePackageContent.toString());
class Reporter {
    constructor(cat) {
        this.cat = cat;
    }
    write(message) {
        console.log(message);
    }
    writeWithHeader(message) {
        console.log(chalk_1.default `[{gray ${this.cat}@${moment().format('HH:mm:ss')}]} ${message}`);
    }
}
;
const reporter = new Reporter('webpack');
function webpackHandler(err, stats) {
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
    reporter.writeWithHeader(chalk_1.default `{cyan bundled} in {yellow ${time.toString()}ms}, `
        + chalk_1.default `hash {yellow ${hash}}{green ${hash == lastHash ? ' same as last' : ''}}`);
    if (hash != lastHash) {
        for (let assetIndex = 0; assetIndex < assets.length; ++assetIndex) {
            const asset = assets[assetIndex];
            console.log(chalk_1.default `{gray asset#}${assetIndex} {yellow ${asset.name}}`
                + chalk_1.default ` {gray size} {yellow ${filesize(asset.size)}} {gray chunks} [${asset.chunks.join(', ')}]`);
        }
        for (const chunk of chunks) {
            console.log(chalk_1.default `{gray chunk#}${chunk.id} `
                + chalk_1.default `{yellow ${chunk.names.join(',')}} {gray size} {yellow ${filesize(chunk.size)}}`);
            let externalModules = [];
            for (let moduleIndex = 0; moduleIndex < chunk.modules.length; ++moduleIndex) {
                const module = chunk.modules[moduleIndex];
                if (!module.name.startsWith('external')) {
                    console.log(chalk_1.default `  {gray #${moduleIndex}} `
                        + chalk_1.default `${module.name} {gray size ${filesize(module.size)}}`);
                }
                else {
                    externalModules.push(module.name.slice(10, -1)); // pattern is 'external ".+"'
                }
            }
            console.log(chalk_1.default `  {gray +} ${externalModules.length} {gray external modules} ${externalModules.join(', ')}`);
        }
        // this.lastHash = hash;
        reporter.writeWithHeader(chalk_1.default `end of {cyan bundle stat}`);
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
        .reduce((x, e) => { x[e] = 'commonjs ' + e; return x; }, {}),
}, webpackHandler);
