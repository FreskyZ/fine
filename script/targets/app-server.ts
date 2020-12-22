import * as fs from 'fs';
import * as chalk from 'chalk';
import { logInfo, logCritical } from '../common';
import { admin } from '../tools/admin';
import { generate } from '../tools/codegen';
import { TypeScriptOptions, transpile } from '../tools/typescript';
import { MyPackOptions, MyPackResult, pack } from '../tools/mypack';

const getTypeScriptOptions = (app: string, watch: boolean): TypeScriptOptions => ({
    base: 'normal',
    entry: `src/${app}/server/index.ts`,
    sourceMap: true,
    watch,
});

const getMyPackOptions = (app: string, files: MyPackOptions['files'], lastResult?: MyPackResult): MyPackOptions => ({
    type: 'lib',
    entry: `/vbuild/${app}/server/index.js`,
    files,
    sourceMap: true,
    output: `dist/${app}/server.js`,
    printModules: true,
    minify: true,
    lastResult,
});

async function buildOnce(app: string): Promise<void> {
    logInfo('mka', chalk`{yellow ${app}-server}`);
    await fs.promises.mkdir(`dist/${app}`, { recursive: true });

    if (!await generate(app, 'server')) {
        return logCritical('mka', chalk`{yellow ${app}-server} failed at code generation`);
    }

    transpile(getTypeScriptOptions(app, false), { afterEmit: async ({ success, files }): Promise<void> => {
        if (!success) {
            return logCritical('mka', chalk`{yellow ${app}-server} failed at transpile typescript`);
        }

        const packResult = await pack(getMyPackOptions(app, files));
        if (!packResult.success) {
            return logCritical('mka', chalk`{yellow ${app}-server} failed at pack`);
        }
    
        // do not sequential await when parallel available
        await Promise.all([
            fs.promises.writeFile(`dist/${app}/server.js`, packResult.jsContent),
            fs.promises.writeFile(`dist/${app}/server.js.map`, packResult.mapContent),
        ]);

        // cannot parallel because this should be after previous 2 finish
        await admin({ type: 'reload-server', app });
        logInfo('mka', `${app}-server complete successfully`);
    } });
}

function buildWatch(app: string) {
    logInfo('mka', chalk`watch {yellow ${app}-server}`);
    fs.mkdirSync(`dist/${app}`, { recursive: true });

    // watch api.xml
    fs.watchFile(`src/${app}/api.xml`, { persistent: false }, (currstat, prevstat) => {
        if (currstat.mtime == prevstat.mtime) {
            return;
        }
        // if error, no emit and tsc watch retranspile will not be triggered
        generate(app, 'server');
    });

    process.on('SIGINT', () => {
        fs.unwatchFile(`src/${app}/api.xml`);
        process.exit(0);
    });

    let lastResult: MyPackResult = null;
    transpile(getTypeScriptOptions(app, true), { afterEmit: async ({ files }) => {
        const currentResult = await pack(getMyPackOptions(app, files, lastResult));
        if (!currentResult.success) {
            return;
        }

        await Promise.all([
            fs.promises.writeFile(`dist/${app}/server.js`, currentResult.jsContent),
            fs.promises.writeFile(`dist/${app}/server.js.map`, currentResult.mapContent),
        ]);
        if (currentResult.hash != lastResult?.hash) {
            await admin({ type: 'reload-server', app });
        }
        lastResult = currentResult;
    }});
    
    // initial code generation
    generate(app, 'server');
}

export async function build(app: string, watch: boolean): Promise<void> {
    if (watch) {
        buildWatch(app);
    } else {
        await buildOnce(app);
    }
}