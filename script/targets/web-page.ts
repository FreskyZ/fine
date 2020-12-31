import * as fs from 'fs';
import * as chalk from 'chalk';
import { logInfo, logCritical, watchvar } from '../common';
import { admin } from '../tools/admin';
import { Asset, upload } from '../tools/ssh';
import { SassOptions, SassResult, sass } from '../tools/sass';
import { TypeScriptOptions, TypeScriptResult, typescript } from '../tools/typescript';

// web page, not web app, they contains hand written html 
//    and at most one sass file which transpiles into one compressed css 
//    and at most one ts file which transpiles into look-like-hand-written javascript
// 1. except the index page, others are available at all domains without the html extension,
// 2. except 404/418, they are reloadable via admin script, reload key is same as PageName
// 3. source file name is same as PageName, url path may not be same as PageName

const getTypeScriptOptions = (pagename: string, watch: boolean): TypeScriptOptions => ({
    base: 'normal',
    entry: `src/pages/${pagename}.ts`,
    additionalLib: ['dom'],
    sourceMap: 'no',
    watch,
});
const getSassOptions = (pagename: string): SassOptions => ({
    entry: `src/pages/${pagename}.sass`,
});
const getUploadAsset = (pagename: string, result: TypeScriptResult | SassResult | 'html'): Asset => result == 'html' ? {
    remote: `WEBROOT/main/${pagename}.html`,
    data: fs.readFileSync(`src/pages/${pagename}.html`),
} : 'files' in result ? {
    remote: `WEBROOT/main/${pagename}.js`,
    data: Buffer.from(result.files[0].content),
} : {
    remote: `WEBROOT/main/${pagename}.css`,
    data: result.resultCss, 
};

async function buildOnce(pagename: string): Promise<void> {
    logInfo('akr', chalk`{cyan ${pagename}-page}`);
    // mkdir(recursive)

    const assets: Asset[] = [getUploadAsset(pagename, 'html')]; // html is here

    const checker = typescript(getTypeScriptOptions(pagename, false));
    if (fs.existsSync(checker.options.entry as string)) {
        const checkResult = checker.check();
        if (!checkResult.success) {
            return logCritical('akr', chalk`{cyan ${pagename}-page} failed at check`);
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
    const adminResult = await admin({ type: 'content', data: { type: 'reload-page', pagename } });
    if (!adminResult) {
        return logCritical('akr', chalk`{cyan ${pagename}-page} failed at reload`);
    }

    logInfo('akr', chalk`{cyan ${pagename}-page} completed succesfully`);
}

async function buildWatch(pagename: string) {
    logInfo('akr', chalk`watch {cyan ${pagename}-page}`);
    // mkdir(recursive)

    const requestReload = watchvar(() => {
        admin({ type: 'content', data: { type: 'reload-page', pagename } });
    });

    const checker = typescript(getTypeScriptOptions(pagename, true));
    if (fs.existsSync(checker.options.entry as string)) {
        checker.watch(async checkResult => {
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
    }, { initialCall: true });

    const htmlEntry = `src/pages/${pagename}.html`;
    logInfo('htm', chalk`watch {yellow ${htmlEntry}}`);
    fs.watch(htmlEntry, { persistent: false }, requestReupload);
}

export function build(pagename: string, watch: boolean) {
    return (watch ? buildWatch : buildOnce)(pagename);
}
