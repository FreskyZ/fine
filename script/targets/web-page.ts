import * as fs from 'fs';
import * as chalk from 'chalk';
import { logInfo, logCritical } from '../common';
import { admin } from '../tools/admin';
import { TypeScriptOptions, TypeScriptResult, transpile as transpileScript } from '../tools/typescript';
import { SassOptions, transpile as transpileStyle } from '../tools/sass';

// web page, not web app, they contains hand written html and at most one sass file and at most one ts file which transpiles into seems-hand-written javascript
// 1. except the index page, others are available at all domains without the html extension,
// 2. except 404/418, they are reloadable via admin action reload-static, reload key is same as PageName
// 3. source file name is same as PageName, url path is not same as PageName

const getTypeScriptOptions = (pagename: string, watch: boolean): TypeScriptOptions => ({
    base: 'normal',
    entry: `src/pages/${pagename}.ts`,
    additionalLib: ['dom'],
    sourceMap: 'hide',
    watch,
});

const getSassOptions = (pagename: string): SassOptions => ({
    file: `src/pages/${pagename}.sass`,
    outputStyle: 'compressed',
});

async function buildOnce(pagename: string): Promise<void> {
    logInfo('mka', chalk`{yellow ${pagename}-page}`);
    await fs.promises.mkdir('dist/main', { recursive: true });
    // although these 3 things can be done in parallel, sequential them to prevent output mess and less `new Promise<>((resolve) ...` code

    const typescriptOptions = getTypeScriptOptions(pagename, false);
    if (fs.existsSync(typescriptOptions.entry)) {
        const files = await new Promise<TypeScriptResult['files']>(resolve => transpileScript(typescriptOptions, { afterEmit: ({ success, files }): void => {
            if (!success) {
                return logCritical('mka', chalk`{yellow ${pagename}-page} failed at transpile typescript`);
            }
            resolve(files);
        } }));
        const code = files[0].content; // this ts config only generates one output file
        await fs.promises.writeFile(`dist/main/${pagename}.js`, code);
    }

    const sassOptions = getSassOptions(pagename);
    if (fs.existsSync(sassOptions.file)) {
        const { success, style } = await transpileStyle(sassOptions);
        if (!success) {
            return logCritical('mka', chalk`{yellow ${pagename}-page} failed at transpile stylesheet`);
        }

        await fs.promises.writeFile(`dist/main/${pagename}.css`, style);
    }

    logInfo('htm', chalk`copy {yellow ${pagename}.html}`);
    await fs.promises.copyFile(`src/pages/${pagename}.html`, `dist/main/${pagename}.html`);
    logInfo('htm', 'copy completed');

    await admin({ type: 'reload-static', key: pagename }); // unknown page name auto ignored
    logInfo('mka', `build ${pagename}-page completed succesfully`);
}

async function buildWatch(pagename: string) {
    logInfo('mka', chalk`watch {yellow ${pagename}-page}`);
    await fs.promises.mkdir('dist/main', { recursive: true });

    const typescriptOptions = getTypeScriptOptions(pagename, true);
    if (fs.existsSync(typescriptOptions.entry)) {
        transpileScript(typescriptOptions, { afterEmit: async ({ files }) => {
            const code = files[0].content; // this ts config only generates one output file
            await fs.promises.writeFile(`dist/main/${pagename}.js`, code);
            admin({ type: 'reload-static', key: pagename }).catch(() => { /* ignore */});
        } });
    }

    const sassOptions = getSassOptions(pagename);
    if (fs.existsSync(sassOptions.file)) {
        fs.watchFile(sassOptions.file, { persistent: false }, async (currstat, prevstat) => {
            if (currstat.mtime == prevstat.mtime) {
                return;
            }
            const { success, style } = await transpileStyle(getSassOptions(pagename));
            if (success) {
                fs.writeFileSync(`dist/main/${pagename}.css`, style);
                admin({ type: 'reload-static', key: pagename }).catch(() => { /* ignore */});
            }
        });
    }

    fs.watchFile(`src/pages/${pagename}.html`, { persistent: false }, (currstat, prevstat) => {
        if (currstat.mtime == prevstat.mtime) {
            return;
        }
        logInfo('htm', chalk`copy {yellow ${pagename}.html}`);
        fs.copyFileSync(`src/pages/${pagename}.html`, `dist/main/${pagename}.html`);
        logInfo('htm', 'copy completed');
        admin({ type: 'reload-static', key: pagename }).catch(() => { /* ignore */});
    });

    process.on('SIGINT', () => {
        fs.unwatchFile(`src/pages/${pagename}.html`);
        if (fs.existsSync(sassOptions.file)) {
            fs.unwatchFile(sassOptions.file);
        }
        process.exit(0);
    });

    logInfo('mka', `tsc watch and fs watch setup`);
}

export function build(pagename: string, watch: boolean) {
    return (watch ? buildWatch : buildOnce)(pagename);
}
