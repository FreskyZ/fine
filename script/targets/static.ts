import * as fs from 'fs';
import * as chalk from 'chalk';
import { logInfo, logCritical, watchvar } from '../common';
import { admin } from '../tools/admin';
import { eslint } from '../tools/eslint';
import { Asset, upload } from '../tools/ssh';
import { SassOptions, SassResult, sass } from '../tools/sass';
import { TypeScriptOptions, TypeScriptResult, MyJSXRuntime, typescript } from '../tools/typescript';

// builtin static pages, they have hand written html,
//    and at most one sass file which transpiles into one compressed css,
//    and at most one ts file which transpiles into look-like-hand-written javascript
// build results are all copied to webroot/static/

const getTypeScriptOptions = (pagename: string, watch: boolean): TypeScriptOptions => pagename == 'user' ? {
    base: 'jsx-page',
    entry: `src/static/${pagename}.tsx`,
    sourceMap: 'no',
    watch,
} : {
    base: 'normal',
    entry: `src/static/${pagename}.ts`,
    additionalLib: ['dom'],
    sourceMap: 'no',
    watch,
};
const getSassOptions = (pagename: string): SassOptions => ({
    entry: `src/static/${pagename}.sass`,
});
const getUploadAsset = (pagename: string, result: TypeScriptResult | SassResult | 'html'): Asset => result == 'html' ? {
    remote: `static/${pagename}.html`,
    data: Buffer.from(fs.readFileSync(`src/static/${pagename}.html`)),
} : 'files' in result ? {
    remote: `static/${pagename}.js`,
    data: Buffer.from(result.files[0].content),
} : {
    remote: `static/${pagename}.css`,
    data: result.resultCss,
};

function setupjsx(result: TypeScriptResult) {
    const content = result.files[0].content;

    const match = /import (?<pat>{[\w\s,]+}) from 'react';/.exec(content); // pat: deconstruction pattern // rust call this syntax node pattern, js world seems using other name but I don't know
    const importreact = `const ${match.groups['pat']} = React;`; // this match is expected to be sucess

    let mycode = content.slice(content.indexOf('\n', content.indexOf('\n', content.indexOf('\n') + 1) + 1) + 1); // my content starts from line 3
    mycode = mycode.replaceAll(/_jsxs?\(_Fragment, /g, 'myjsxf(').replaceAll(/_jsxs?/g, 'myjsx'); // replace _jsxs? to myjsx, because a lot of underscore reduce readability

    result.files[0].content = importreact + MyJSXRuntime + '\n' + mycode; // put import react and jsx runtime in one line and then mycode
}

async function buildOnce(pagename: string): Promise<void> {
    logInfo('akr', chalk`{cyan ${pagename}-page}`);
    // mkdir(recursive)

    const assets: Asset[] = [getUploadAsset(pagename, 'html')]; // html is here

    const checker = typescript(getTypeScriptOptions(pagename, false));
    if (fs.existsSync(checker.options.entry as string)) {
        await eslint(`${pagename}-page`, 'browser', checker.options.entry);

        const checkResult = checker.check();
        if (!checkResult.success) {
            return logCritical('akr', chalk`{cyan ${pagename}-page} failed at check`);
        }
        if ((checker.options.entry as string).endsWith('tsx')) {
            setupjsx(checkResult);
        }
        assets.push(getUploadAsset(pagename, checkResult));
    }

    const transpiler = sass(getSassOptions(pagename));
    if (fs.existsSync(transpiler.options.entry)) {
        const transpileResult = await transpiler.transpile();
        if (!transpileResult.success) {
            return logCritical('akr', chalk`{cyan ${pagename}-page} failed at transpile`);
        }
        assets.push(getUploadAsset(pagename, transpileResult));
    }

    const uploadResult = await upload(assets);
    if (!uploadResult) {
        return logCritical('akr', chalk`{cyan ${pagename}-page} failed at upload`);
    }
    const adminResult = await admin.core({ type: 'content', sub: { type: 'reload-static', key: pagename } });
    if (!adminResult) {
        return logCritical('akr', chalk`{cyan ${pagename}-page} failed at reload`);
    }

    logInfo('akr', chalk`{cyan ${pagename}-page} completed succesfully`);
}

function buildWatch(pagename: string) {
    logInfo('akr', chalk`watch {cyan ${pagename}-page}`);
    // mkdir(recursive)

    const requestReload = watchvar(() => {
        admin.core({ type: 'content', sub: { type: 'reload-static', key: pagename } });
    }, { interval: 2021 });

    const checker = typescript(getTypeScriptOptions(pagename, true));
    if (fs.existsSync(checker.options.entry as string)) {
        checker.watch(async checkResult => {
            if ((checker.options.entry as string).endsWith('tsx')) {
                setupjsx(checkResult);
            }
            // tsc does not print watched message because in backend targets it will be directly followed by a mypack 'repack' message, so add one here
            logInfo('tsc', `completed with no diagnostics`);
            if (await upload(getUploadAsset(pagename, checkResult))) { requestReload(); }
        });
    }

    const transpiler = sass(getSassOptions(pagename));
    if (fs.existsSync(transpiler.options.entry)) {
        transpiler.watch(async transpileResult => {
            if (await upload(getUploadAsset(pagename, transpileResult))) { requestReload(); }
        });
    }

    const requestReupload = watchvar(async () => {
        logInfo('htm', 'reupload');
        if (await upload(getUploadAsset(pagename, 'html'))) { requestReload(); }
    }, { interval: 2021, initialCall: true });

    const htmlEntry = `src/static/${pagename}.html`;
    logInfo('htm', chalk`watch {yellow ${htmlEntry}}`);
    fs.watch(htmlEntry, { persistent: false }, requestReupload);
}

export function build(pagename: string, watch: boolean): void {
    (watch ? buildWatch : buildOnce)(pagename);
}
