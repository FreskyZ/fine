
import * as chalk from 'chalk';
import * as filesize from 'filesize';
import * as webpack from 'webpack';
import { WebpackPlainStat } from './types';

export async function run(options: webpack.Configuration) {
    // wpb: webpack bundler
    console.log(`[wpb] bundling ${options.entry}`);

    return new Promise<WebpackPlainStat>((resolve, reject) => {
        webpack(options, (error, statObject) => {
            if (error) {
                console.log('[wpb] bundle failed by critical error: ' + error.message);
                reject(error);
                return;
            }
        
            // stat contains some properties (maybe recursively) with class types (have methods)
            // to json flattens them to to-json-able value, so the type is called Plain
            const stats = statObject!.toJson() as WebpackPlainStat;
            console.log(chalk`[wpb] bundled in {yellow ${stats.time}ms}, hash {yellow ${stats.hash}}`);

            for (const error of stats.errors) {
                console.error(`error: ${error.message}`);
            }
            for (const warning of stats.warnings) {
                console.error(`warning: ${warning}`);
            }

            for (let assetIndex = 0; assetIndex < stats.assets.length; ++assetIndex) {
                const asset = stats.assets[assetIndex];
                console.log(chalk`  {gray asset#}${assetIndex} {yellow ${asset.name}}` 
                    + chalk` {gray size} {yellow ${filesize(asset.size)}} {gray chunks} [${asset.chunks.join(', ')}]`);
            }

            for (const chunk of stats.chunks) {
                console.log(chalk`  {gray chunk#}${chunk.id} {yellow ${chunk.names.join(',')}} {gray size} {yellow ${filesize(chunk.size)}}`);

                let externalModules = [];
                for (let moduleIndex = 0; moduleIndex < chunk.modules.length; ++moduleIndex) {
                    const module = chunk.modules[moduleIndex];
                    if (!module.name.startsWith('external')) {
                        console.log(chalk`    {gray #${moduleIndex}} ${module.name} {gray size ${filesize(module.size)}}`);
                    } else {
                        externalModules.push(module.name.slice(10, -1)); // pattern is 'external ".+"'
                    }
                }
                console.log(chalk`    {gray +} ${externalModules.length} {gray external modules} ${externalModules.join(', ')}`);
            }

            console.log(chalk`[wpb] end of {cyan bundle stat}`);
            resolve(stats);
        });
    });
}
