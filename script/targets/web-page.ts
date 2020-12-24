import * as fs from 'fs';
import * as chalk from 'chalk';
import { logInfo, logCritical } from '../common';
import { admin } from '../tools/admin';
import { TypeScriptOptions, typescript } from '../tools/typescript';
import { SassOptions, sass } from '../tools/sass';

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
    entry: `src/pages/${pagename}.sass`,
    output: `dist/main/${pagename}.css`,
});

async function buildOnce(pagename: string): Promise<void> {
    logInfo('mka', chalk`{cyan ${pagename}-page}`);
    await fs.promises.mkdir('dist/main', { recursive: true });
    // although these 3 things can be done in parallel, sequential them to prevent output mess and less `new Promise<>((resolve) ...` code

    const checker = typescript(getTypeScriptOptions(pagename, false));
    if (fs.existsSync(checker.options.entry)) {
        const checkResult = checker.check();
        if (!checkResult.success) {
            return logCritical('mka', chalk`{yellow ${pagename}-page} failed at transpile typescript`);
        }
        await fs.promises.writeFile(`dist/main/${pagename}.js`, checkResult.files[0].content);
    }

    const transpiler = sass(getSassOptions(pagename));
    if (fs.existsSync(transpiler.options.entry)) {
        const transpileResult = await transpiler.transpile();
        if (!transpileResult.success) {
            return logCritical('mka', chalk`{yellow ${pagename}-page} failed at transpile stylesheet`);
        }
    }

    logInfo('htm', chalk`copy {yellow ${pagename}.html}`);
    await fs.promises.copyFile(`src/pages/${pagename}.html`, `dist/main/${pagename}.html`);
    logInfo('htm', 'copy completed');

    await admin({ type: 'reload-static', key: pagename }); // unknown page name auto ignored
    logInfo('mka', chalk`{cyan ${pagename}-page} completed succesfully`);
}

function watchHtml(pagename: string, callback: () => any) {
    const entry = `src/pages/${pagename}.html`;
    logInfo('htm', chalk`watch {yellow ${entry}}`);

    // fs.watch unexpectedly triggers 2 events on html edit, use same strategy as admin reload to prevent frequent call
    let recopyRequested = false;
    fs.watch(entry, { persistent: false }, () => {
        recopyRequested = true;
    });

    const actualCopy = () => {
        fs.copyFileSync(`src/pages/${pagename}.html`, `dist/main/${pagename}.html`);
        logInfo('htm', 'copy completed');
        callback();
    }

    setInterval(() => {
        if (recopyRequested) {
            recopyRequested = false;
            logInfo('htm', 'recopy');
            actualCopy();
        }
    }, 3001);

    actualCopy(); // initial copy
}

async function buildWatch(pagename: string) {
    logInfo('mka', chalk`watch {cyan ${pagename}-page}`);
    await fs.promises.mkdir('dist/main', { recursive: true });

    // prevent frequent reload
    let reloadRequested = false;

    const checker = typescript(getTypeScriptOptions(pagename, true));
    if (fs.existsSync(checker.options.entry)) {
        checker.watch(checkResult => {
            // tsc does not print watched message because in backend targets it will be directly followed by a mypack 'repack' message, so add one here
            logInfo('tsc', `completed with no diagnostics`);
            fs.writeFileSync(`dist/main/${pagename}.js`, checkResult.files[0].content);
            reloadRequested = true;
        });
    }

    const transpiler = sass(getSassOptions(pagename));
    if (fs.existsSync(transpiler.options.entry)) {
        transpiler.watch(() => {
            reloadRequested = true;
        });
    }

    watchHtml(pagename, () => reloadRequested = true);

    setInterval(() => {
        if (reloadRequested) {
            reloadRequested = false;
            admin({ type: 'reload-static', key: pagename }).catch(() => { /* ignore */});
        }
    }, 3002).unref();
}

export function build(pagename: string, watch: boolean) {
    return (watch ? buildWatch : buildOnce)(pagename);
}
