
import * as chalk from 'chalk';
import * as filesize from 'filesize';
import * as webpack from 'webpack';
import { WebpackStat, WebpackStatModule } from './types';

/** 
 * @param previousModuleList null for direct run, null for first watch, previous return value for normal watch; show complete list for null, show diff for have value
 * @returns source file name list 
*/
function printStat(stats: WebpackStat, previousModules: WebpackStatModule[]): WebpackStatModule[] {
    console.log(chalk`[wpb] bundled {yellow ${stats.assets.length}} asset in {yellow ${stats.time}ms}, hash {yellow ${stats.hash}}`);

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

    const modules = stats.chunks.reduce<WebpackStatModule[]>((acc, chunk) => { acc.push(...chunk.modules); return acc; }, []);

    if (previousModules == null) {
        for (const chunk of stats.chunks) {
            console.log(chalk`  {gray chunk#}${chunk.id} {yellow ${chunk.names.join(',')}} {gray size} {yellow ${filesize(chunk.size)}}`);

            const externalModules = [];
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
    } else {
        for (const newModule of modules.filter(n => !previousModules.some(p => p.name === n.name))) {
            console.log(chalk`  + ${newModule.name} {gray size ${filesize(newModule.size)}}`);
        }
        for (const removedModule of previousModules.filter(p => !modules.some(n => n.name === p.name))) {
            console.log(chalk`  - {gray removed ${removedModule.name}}`);
        }
    }
    
    return modules;
}

/** @param oncompleted called when complete, stat is null for failure */
export async function run(options: webpack.Configuration, onerror: (error: Error) => void, oncompleted: (stat: WebpackStat) => void) {
    // wpb: webpack bundler
    console.log(`[wpb] bundling ${options.entry}`);

    webpack(options, (error, statObject) => {
        if (error) {
            console.log('[wpb] critical error: ' + error.message);
            onerror(null);
            return;
        }
    
        const stats = statObject?.toJson() as WebpackStat;
        printStat(stats, null);
        oncompleted(stats);
    });
}

/** @param onwatched called everytime when bundle completed, will not be called if failure or no change */
export async function watch(config: webpack.Configuration, onwatched: (stat: WebpackStat) => void) {
    console.log(`[wpb] bundling watching ${config.entry}`);

    let lastHash: string = null;
    let lastModules: WebpackStatModule[] = null;
    webpack({ ...config, watch: true }, (error, statObject) => {
        if (error) {
            console.log('[wpb] critical error: ' + error.message);
            return;
        }
    
        const stats = statObject?.toJson() as WebpackStat;
        if (stats.hash == lastHash) {
            lastHash = stats.hash;
            console.log('[wpb] rebundle no change');
            return;
        } else {
            lastHash = stats.hash;
        }

        lastModules = printStat(stats, lastModules);
        onwatched(stats);
    })
}
