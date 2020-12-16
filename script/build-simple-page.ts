import * as fs from 'fs';
import * as chalk from 'chalk';
import { logInfo, logError } from './common';
import { TypeScriptOptions, TypeScriptResult, transpile as transpileScript } from './run-typescript';
import { SassOptions, transpile as transpileStyle } from './run-sass';
import { admin } from './admin';

// build simple page, copy html, transpile sass to css, transpile one ts file to one js file

type SimplePageName = 'index' | 'login';
const getReloadKey = (name: SimplePageName) => name == 'index' ? 'www' : 'login';

// also index page do not have js for now, reserved for it and skip for index
const getTypeScriptOptions = (name: SimplePageName): TypeScriptOptions => ({
    entry: `src/home-page/${name}.ts`,
    additionalLib: ['dom'],
});

const getSassOptions = (name: SimplePageName): SassOptions => ({
    file: `src/home-page/${name}.sass`,
    outputStyle: 'compressed',
});

// ATTENTION don't forget // outDir: 'dist/home/',

async function buildOnce(name: SimplePageName) {
    logInfo('mka', chalk`{yellow ${name}-page}`);
    // although these 3 things can be done in parallel, sequential them to prevent output mess and less `new Promise<>((resolve) ...` code

    // js
    if (name != 'index') {
        const files = await new Promise<TypeScriptResult['files']>(resolve => transpileScript(getTypeScriptOptions(name), { afterEmit: ({ success, files }) => {
            if (!success) {
                logError('mka', chalk`{yellow ${name}-page} failed at transpile typescript`);
                process.exit(1);
            }
            resolve(files);
        } }));
        await fs.promises.writeFile(`dist/home/${name}.js`, files[0].content); // this only generates one output file
    }

    // css
    try {
        const code = await transpileStyle(getSassOptions(name));
        await fs.promises.writeFile(`dist/home/${name}.css`, code);
    } catch {
        logError('mka', chalk`{yellow ${name}-page} failed at transpile stylesheet`);
        process.exit(1);
    }

    // html
    logInfo('htm', chalk`copy {yellow ${name}.html}`);
    await fs.promises.copyFile(`src/home-page/${name}.html`, `dist/home/${name}.html`);
    logInfo('htm', 'copy completed');

    await admin({ type: 'reload-static', key: getReloadKey(name) });
    logInfo('mka', `build ${name}-page completed succesfully`);   
}

function buildWatch(name: SimplePageName) {
    logInfo('mka', chalk`watch {yellow ${name}-page}`);

    if (name != 'index') {
        transpileScript({ ...getTypeScriptOptions(name), watch: true }, { afterEmit: ({ files }) => {
            fs.writeFileSync(`dist/home/${name}.js`, files[0].content); // this only generates one output file
            admin({ type: 'reload-static', key: getReloadKey(name) }).catch(() => { /* ignore */});
        } });
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
        transpileStyle(getSassOptions(name)).then(code => {
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
