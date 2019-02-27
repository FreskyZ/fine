const chalk = require('chalk');
const filesize = require('filesize');
const webpack = require('webpack');
const buildConfig = require('./build_config');
const Reporter = require('./reporter');

const reporter = new Reporter('webpack');

module.exports = class WebpackRunner {
    constructor({ configName }) {
        this.lastHash = null;
        this.compiler = webpack(buildConfig[`webpack:${configName}`]);
    }

    defaultStatHandler(err, stats) {
        if (err) {
            reporter.writeWithHeader(`error: ${err}`);
            return;
        }

        const statData = stats.toJson();
        if (stats.hasErrors()) {
            reporter.writeWithHeader(`${statData.errors.length} bundle errors`);
            for (const error of statData.errors) {
                console.error(error);
            }
            return;
        }
        if (stats.hasWarnings()) {
            reporter.writeWithHeader(`${statData.warnings.length} bundle warnings`);
            for (const warning of statData.warnings) {
                console.log(warning);
            }
        }

        const { version, hash, time, assets, chunks, modules } = statData;
        reporter.writeWithHeader(chalk`{cyan bundled} in {yellow ${time.toString()}ms}, ` 
            + chalk`hash {yellow ${hash}}{green ${hash == this.lastHash ? ' same as last' : ''}}`);
        
        if (hash != this.lastHash) {
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

            this.lastHash = hash;
            reporter.writeWithHeader(chalk`end of {cyan bundle stat}`);
        }
    }
 
    run({ inputFileSystem }) {
        reporter.writeWithHeader(chalk.cyan('bundling'));
        this.compiler.inputFileSystem = inputFileSystem;
        this.compiler.run(this.defaultStatHandler.bind(this));
    }
};

