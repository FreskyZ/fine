import * as fs from 'fs';
import * as path from 'path';
import * as chalk from 'chalk';
import * as SFTPClient from 'ssh2-sftp-client';
import { logInfo, logCritical } from '../common';
import { admin } from '../tools/admin';
import { codegen } from '../tools/codegen';
import { TypeScriptOptions, typescript } from '../tools/typescript';
import { MyPackOptions, mypack } from '../tools/mypack';

const getTypeScriptOptions = (app: string, watch: boolean): TypeScriptOptions => ({
    base: 'normal',
    entry: `src/${app}/server/index.ts`,
    sourceMap: 'hide',
    watch,
});

const getMyPackOptions = (app: string, files: MyPackOptions['files']): MyPackOptions => ({
    type: 'lib',
    entry: `/vbuild/${app}/server/index.js`,
    files,
    sourceMap: true,
    output: `dist/${app}/server.js`,
    printModules: true,
    minify: true,
});

async function buildOnce(app: string): Promise<void> {
    logInfo('mka', chalk`{cyan ${app}-server}`);
    await fs.promises.mkdir(`dist/${app}`, { recursive: true });

    const codegenResult = await codegen(app, 'server').generate();
    if (!codegenResult.success) {
        return logCritical('mka', chalk`{cyan ${app}-server} failed at code generation`);
    }

    const checkResult = typescript(getTypeScriptOptions(app, false)).check();
    if (!checkResult.success) {
        return logCritical('mka', chalk`{cyan ${app}-server} failed at check`);
    }

    const packResult = await mypack(getMyPackOptions(app, checkResult.files)).run();
    if (!packResult.success) {
        return logCritical('mka', chalk`{cyan ${app}-server} failed at pack`);
    }

    try {
        logInfo('ssh', 'deploy assets');
        const sftp = new SFTPClient();
        await sftp.connect({ host: 'domain.com', username: 'root', privateKey: await fs.promises.readFile('SSH_KEY'), passphrase: 'SSH_PASSPHRASE' });
        await sftp.fastPut(path.resolve(`dist/${app}/server.js`), `WEBROOT/${app}/server.js`);
        await sftp.fastPut(path.resolve(`dist/${app}/server.js.map`), `WEBROOT/${app}/server.js.map`);
        await sftp.end();
        logInfo('ssh', 'completed successfully');
    } catch (ex) {
        console.log(ex);
        logCritical('ssh', 'failed to connect or put file, try later');
    }

    logInfo('mka', chalk`{cyan ${app}-server} complete successfully`);
}

function buildWatch(app: string) {
    logInfo('mka', chalk`watch {cyan ${app}-server}`);
    fs.mkdirSync(`dist/${app}`, { recursive: true });

    codegen(app, 'server').watch(); // no callback watch is this simple

    const packer = mypack(getMyPackOptions(app, null));
    typescript(getTypeScriptOptions(app, true)).watch(async ({ files }) => {
        packer.options.files = files; // this usage is correct but unexpected, change this later
        const packResult = await packer.run();
        if (!packResult.success) {
            return;
        }
        if (packResult.hasChange) {
            await admin({ type: 'auth', data: { type: 'reload-server', app } }).catch(() => { /* ignore */});
        }
    });
}

export async function build(app: string, watch: boolean): Promise<void> {
    if (watch) {
        buildWatch(app);
    } else {
        await buildOnce(app);
    }
}