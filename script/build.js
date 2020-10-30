"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const chalk_1 = __importDefault(require("chalk"));
const filesize = __importStar(require("filesize"));
const moment = __importStar(require("moment"));
const webpack = __importStar(require("webpack"));
// webpack loads it by name, but if not import here, tsc will ignore that file
const typescript_loader = __importStar(require("./typescript-loader"));
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
