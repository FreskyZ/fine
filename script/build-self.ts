import * as fs from 'fs';
import * as path from 'path';
import * as ts from './run-typescript';

// "build-bootstrap": "tsc script/build.ts --outDir script/bin --lib ES2020 --target ES2020 --module commonjs --moduleResolution node",

const typescriptEntry = ['script/build.ts'];
const typescriptOptions = {
    types: ['node'],
    outDir: 'script/bin',
    writeFileHook: (fileName, data, writeBOM, onError, sourceFiles, originalWriteFile) => {
        // move entry out by redirect require, add shebang to allow direct execute by shell, replace use strict by the way
        if (path.basename(fileName) == 'build.js') {
            // ATTENTION: name the script biu until build folder is removed by using memfs in webpack
            fs.writeFileSync('biu', data
                .replace('"use strict";', '#!/usr/bin/env node')
                .split('require("./').join('require("./script/bin/')); // it seems that replace left recursive need to be implemented this way
        } else {
            originalWriteFile(fileName, data, writeBOM, onError, sourceFiles);
        }
    }
} as ts.CompilerOptions;

export function build() {
    console.log('[bud] building self');

    if (ts.compile(typescriptEntry, typescriptOptions)) {
        console.log('[bud] build self completed succesfully');
    } else {
        console.log('[bud] build self completed with error');
    }
}
