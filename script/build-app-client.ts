// import * as fs from 'fs';
import * as chalk from 'chalk';
// import { admin } from './admin';
import { logInfo } from './common';
// import { generate } from './run-codegen';
// import { TypeScriptCompilerOptions, JsxEmit, ModuleKind, installReadFileHook, transpileOnce } from './run-typescript';
// import { MyPackOptions } from './run-mypack';

// const getTypescriptEntry = (app: string) => `src/${app}/client/index.tsx`;
// const typescriptOptions: TypeScriptCompilerOptions = {
//     lib: ['lib.dom.d.ts'],
//     sourceMap: true,
//     outDir: '/vbuild',
//     jsx: JsxEmit.React,
//     module: ModuleKind.ESNext,
//     // NOTE: something like optional chaining (?.) is not supported on edge (chromium) android, 
//     //       redirect to ES2015 if newest version still do not support
//     // target: ScriptTarget.ES2015,
//     esModuleInterop: true,
// } as TypeScriptCompilerOptions;

// const getSassOptions = (app: string): SassOptions => ({
//     file: `src/${app}/client/index.sass`,
//     outputStyle: 'compressed',
// });

async function buildOnce(app: string) {
    logInfo('mka', chalk`{yellow ${app}-client}`);
    
    // const files: MyPackOptions['files'] = [];
    // installReadFileHook(commonReadFileHook);
    // if (!transpileOnce(getTypescriptEntry(app), { ...typescriptOptions, 
    //     writeFileHook: (name: string, content: string) => files.push({ name, content }),
    // } as unknown as TypeScriptCompilerOptions)) {
    //     logError('mka', chalk`{yellow ${app}-client} failed at transpile typescript`);
    //     process.exit(1);
    // }

    // // ATTENTION TEMP
    // let content = files.find(f => f.name == '/vbuild/index.js').content;
    // content = content.slice(content.indexOf('\n') + 1); // remove import React from 'react'
    // content = content.slice(content.indexOf('\n') + 1); // remove import ReactDOM from 'react-dom'
    // const importStatement = content.slice(0, content.indexOf('\n')); // the import xxx from 'antd' statement
    // const usedAntdComponents = importStatement.slice(importStatement.indexOf('{'), importStatement.indexOf('}') + 1);
    // content = `const ${usedAntdComponents} = antd;` + content.slice(content.indexOf('\n'));
    // // END OF ATTENTION

    // await fs.promises.writeFile(`dist/${app}/client.js`, content);

    // // css
    // try {
    //     const code = await transpileStyle(getSassOptions(app));
    //     await fs.promises.writeFile(`dist/${app}/index.css`, code);
    // } catch {
    //     logError('mka', chalk`{yellow ${app}-client} failed at transpile stylesheet`);
    //     process.exit(1);
    // }

    // // html
    // logInfo('htm', chalk`copy {yellow src/${app}/index.html}`);
    // await fs.promises.copyFile(`src/${app}/index.html`, `dist/${app}/index.html`);
    // logInfo('htm', 'copy completed');

    // // const packResult = await pack(createMyPackOptions(app, files));
    // // if (!packResult.success) {
    // //     logError('mka', chalk`{yellow ${app}-client} failed at pack`);
    // //     process.exit(1);
    // // }
    // // await fsp.writeFile(`dist/${app}/client.js`, packResult.jsContent);
    // // await fsp.writeFile(`dist/${app}/client.js.map`, packResult.mapContent);

    // await admin({ type: 'reload-static', key: app });
    // logInfo('mka', `${app}-client completed successfully`);
}

function buildWatch(_app: string) {
}

export async function build(app: string, watch: boolean): Promise<void> {
    if (watch) {
        buildWatch(app);
    } else {
        await buildOnce(app);
    }
}