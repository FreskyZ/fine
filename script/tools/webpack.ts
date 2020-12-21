
import * as chalk from 'chalk';
import * as filesize from 'filesize';
import * as webpack from 'webpack';
import { logInfo, logError } from '../common';
import { WebpackStat, WebpackStatModule } from '../types/webpack';

export type WebpackConfiguration = webpack.Configuration & {
    printStat?: boolean, 
};

function printStat(stats: WebpackStat, lastStat: WebpackStat) {
    logInfo('wpb', chalk`{yellow ${stats.assets.length}} asset in {yellow ${stats.time}ms}, hash {yellow ${stats.hash}}`);

    for (const error of stats.errors) {
        console.log(error);
    }
    for (const warning of (stats.warnings as any[])) {
        console.log(warning.message ?? warning);
    }

    const modules = stats.chunks.reduce<WebpackStatModule[]>((acc, chunk) => { acc.push(...chunk.modules); return acc; }, []);

    if (lastStat == null) {
        for (let assetIndex = 0; assetIndex < stats.assets.length; ++assetIndex) {
            const asset = stats.assets[assetIndex];
            console.log(chalk`  {gray asset#}${assetIndex} {yellow ${asset.name}}` 
                + chalk` {gray size} {yellow ${filesize(asset.size)}} {gray chunks} [${asset.chunks.join(', ')}]`);
        }

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

            for (let line = 0; line < Math.ceil(externalModules.length / 5); ++line) {
                if (line == 0) {
                    console.log(chalk`    {gray +} ${externalModules.length} {gray external modules} ${externalModules.filter((_, i) => Math.floor(i / 5) == 0).join(', ')}`);
                } else {
                    console.log(chalk`                        + ${externalModules.filter((_, i) => Math.floor(i / 5) == line).join(', ')}`);
                }
            }
        }
    } else {
        const previousModules = lastStat.chunks.reduce<WebpackStatModule[]>((acc, chunk) => { acc.push(...chunk.modules); return acc; }, []);
        const addedModules = modules.filter(n => !previousModules.some(p => p.name === n.name));
        const removedModules = previousModules.filter(p => !modules.some(n => n.name === p.name));

        for (let assetIndex = 0; assetIndex < stats.assets.length; ++assetIndex) {
            const asset = stats.assets[assetIndex];
            console.log(chalk`  {gray asset#}${assetIndex} {yellow ${asset.name}}` 
                + chalk` {gray size} {yellow ${filesize(asset.size)}} {gray chunks} [${asset.chunks.join(', ')}]`
                + (assetIndex == stats.assets.length - 1 && addedModules.length == 0 && removedModules.length == 0 ? chalk`{gray [no module list change]}` : ''));
        }

        for (const addedModule of addedModules) {
            console.log(chalk`  + ${addedModule.name} {gray size ${filesize(addedModule.size)}}`);
        }
        for (const removedModule of removedModules) {
            console.log(chalk`  - {gray removed ${removedModule.name}}`);
        }
    }
    
    return modules;
}

export async function bundleOnce(options: WebpackConfiguration, onerror: (error: Error) => any, oncompleted: (stat: WebpackStat) => any) {
    logInfo('wpb', chalk`once {yellow ${options.entry}}`);

    const enablePrintStat = !('printStat' in options) || options.printStat;
    delete options.printStat;

    const compiler =  webpack(options);
    compiler.run((error, statObject) => {
        if (error) {
            logError('wpb', 'critical error: ' + error.message);
            onerror(null);
            return;
        }
    
        const stats = statObject?.toJson() as WebpackStat;
        if (enablePrintStat) { 
            printStat(stats, null); 
        } else {
            logInfo('wpb', 'completed with no error');
        }
        oncompleted(stats);
    });
}

/** @param onwatched called everytime when bundle completed, will not be called if failure or no change */
export async function bundleWatch(options: WebpackConfiguration, onwatched: (stat: WebpackStat) => any) {
    logInfo('wpb', chalk`watch {yellow ${options.entry}}`);

    let lastStat: WebpackStat = null;
    webpack({ ...options, watch: true }, (error, statObject) => {
        if (error) {
            logError('wpb', 'critical error: ' + error.message);
            return;
        }
    
        const stats = statObject?.toJson() as WebpackStat;
        if (stats.hash == lastStat.hash) {
            lastStat = stats;
            logInfo('wpb', 'completed with no change');
            return;
        } else {
        }

        printStat(stats, lastStat);
        lastStat = stats;
        onwatched(stats);
    })
}
