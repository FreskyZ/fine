import * as fs from 'fs';
import * as chalk from 'chalk';
import { admin } from './admin';
import { logInfo, logError } from './common';
import { generate } from './run-codegen';
import { TypeScriptOptions, transpile } from './run-typescript';
import { MyPackOptions, MyPackResult, pack } from './run-mypack';

const getTypeScriptOptions = (app: string, watch: boolean,): TypeScriptOptions => ({
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

async function buildOnce(app: string) {
    logInfo('mka', chalk`{yellow ${app}-server}`);

    if (!await generate(app, 'server')) {
        logError('mka', chalk`{yellow ${app}-server} failed at code generation`);
        process.exit(1);
    }

    transpile(getTypeScriptOptions(app, false), { afterEmit: async ({ success, files }) => {
        if (!success) {
            logError('mka', chalk`{yellow ${app}-server} failed at transpile typescript`);
            process.exit(1);
        }

        const packResult = await pack(getMyPackOptions(app, files));
        if (!packResult.success) {
            logError('mka', chalk`{yellow ${app}-server} failed at pack`);
            process.exit(1);
        }
    
        // do not sequential await when parallel available
        await Promise.all([
            fs.promises.writeFile(`dist/${app}/server.js`, packResult.jsContent),
            fs.promises.writeFile(`dist/${app}/server.js.map`, packResult.mapContent),
        ]);

        // cannot parallel because this should be after previous 2 finish
        await admin({ type: 'reload-server', app });
        logInfo('mka', `${app}-server completed successfully`);
    } });
}

function buildWatch(app: string) {
    logInfo('mka', chalk`watch {yellow ${app}-server}`);

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