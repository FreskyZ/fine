import * as ts from 'typescript';
import * as rts from './run-typescript';

// "build-bootstrap": "tsc script/build.ts --outDir script/bin --lib ES2020 --target ES2020 --module ES2020 --moduleResolution node --allowSyntheticDefaultImports true",

const typescriptEntry = 'script/build.ts';
const typescriptOptions: ts.CompilerOptions = {
    types: ['node'],
    outDir: 'script/bin',
};

export default function run() {
    console.log('[bud] bootstrapping');

    if (rts.compile(typescriptEntry, typescriptOptions)) {
        console.log('[bud] bootstrap completed succesfully');
    } else {
        console.log('[bud] bootstrap completed with error');
    }
}
