import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as chalk from 'chalk';
import { logInfo, logError, commonReadFileHook, commonWatchReadFileHook } from './common';
import { TypeScriptCompilerOptions, transpileOnce, transpileWatch } from './run-typescript';
import { Options as SassOptions, render as transpileStyle } from 'node-sass';
import { admin } from './admin';

// build simple page, copy html, transpile sass to css, transpile one ts file to one js file

type SimplePageName = 'index' | 'login';
const getReloadKey = (name: SimplePageName) => name == 'index' ? 'www' : 'login';

// also index page do not have js for now, reserved for it and skip for index
const getTypeScriptEntry = (name: SimplePageName) => `src/home-page/${name}.ts`;
const typescriptOptions = {
    // types: ['node'],
    outDir: 'dist/home/',
    lib: ['lib.dom.d.ts'],
    readFileHook: commonReadFileHook,
    watchReadFileHook: commonWatchReadFileHook,
} as TypeScriptCompilerOptions;

const getSassOptions = (name: SimplePageName) => ({
    file: `src/home-page/${name}.sass`,
    outputStyle: 'compressed',
} as SassOptions);

// directly call sass only happens in simple pages while app front end is planed to use webpack with sass-loader
async function transpileSass(options: SassOptions): Promise<string> {
    logInfo('css', chalk`transpile {yellow ${options.file}}`);

    return new Promise((resolve, reject) => {
        transpileStyle(options, (error, result) => {
            if (error) {
                logError('css', `error at ${options.file}:${error.line}:${error.column}: ${error.message}`);
                reject();
            } else {
                logInfo('css', `transpile completed in ${result.stats.duration}ms`);
                resolve(result.css.toString('utf-8'));
            }
        });
    });
}

async function buildOnce(name: SimplePageName) {
    logInfo('mka', chalk`{yellow ${name}-page}`);
    // although these 3 things can be done in parallel, sequential them to prevent output mess

    // js
    if (name != 'index') {
        if (!transpileOnce(getTypeScriptEntry(name), typescriptOptions)) {
            logError('mka', chalk`{yellow ${name}-page} failed at transpile typescript`);
            process.exit(1);
        }
    }

    // css
    try {
        const code = await transpileSass(getSassOptions(name));
        await fsp.writeFile(`dist/home/${name}.css`, code);
    } catch {
        logError('mka', chalk`{yellow ${name}-page} failed at transpile stylesheet`);
        process.exit(1);
    }

    // html
    logInfo('htm', chalk`copy {yellow ${name}.html}`);
    await fsp.copyFile(`src/home-page/${name}.html`, `dist/home/${name}.html`);
    logInfo('htm', 'copy completed');

    await admin({ type: 'reload-static', key: getReloadKey(name) });
    logInfo('mka', `build ${name}-page completed succesfully`);   
}

function buildWatch(name: SimplePageName) {
    logInfo('mka', chalk`watch {yellow ${name}-page}`);

    if (name != 'index') {
        transpileWatch(getTypeScriptEntry(name), {
            ...typescriptOptions,
            watchEmit: () => {
                admin({ type: 'reload-static', key: getReloadKey(name) }).catch(() => { /* ignore */});
            },
        } as TypeScriptCompilerOptions);
    }

    fs.watchFile(`src/home-page/${name}.html`, { persistent: false }, (currstat, prevstat) => {
        if (currstat.mtime == prevstat.mtime) {
            return;
        }
        logInfo('htm', chalk`copy {yellow ${name}.html}`);
        fs.copyFileSync(`src/home-page/${name}.html`, `dist/home/${name}.html`);
        logInfo('htm', 'copy completed');
        admin({ type: 'reload-static', key: getReloadKey(name) }).catch(() => { /* ignore */});
    });

    const sassOptions = getSassOptions(name);
    fs.watchFile(sassOptions.file, { persistent: false }, (currstat, prevstat) => {
        if (currstat.mtime == prevstat.mtime) {
            return;
        }
        transpileSass(getSassOptions(name)).then(code => {
            fs.writeFileSync(`dist/home/${name}.css`, code);
            admin({ type: 'reload-static', key: getReloadKey(name) }).catch(() => { /* ignore */});
        }).catch(() => { /* error already reported, ignore */});
    });

    process.on('SIGINT', () => {
        fs.unwatchFile(`src/home-page/${name}.html`);
        fs.unwatchFile(sassOptions.file);
        process.exit(0);
    });

    logInfo('mka', `tsc watch and fs watch setup`);
}

export async function build(name: SimplePageName, watch: boolean): Promise<void> {
    if (watch) {
        buildWatch(name);
    } else {
        await buildOnce(name);
    }
}
