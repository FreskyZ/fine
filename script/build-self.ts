import * as ts from 'typescript';
import * as rts from './run-typescript';

// "build-bootstrap": "tsc script/build.ts --outDir script/bin --lib ES2020 --target ES2020 --module commonjs --moduleResolution node",

const typescriptEntry = ['script/build.ts', 'script/watch.ts', 'script/admin.ts'];
const typescriptOptions: ts.CompilerOptions = {
    types: ['node'],
    outDir: 'script/bin',
};

export default function build() {
    console.log('[bud] building self');

    if (rts.compile(typescriptEntry, typescriptOptions)) {
        console.log('[bud] build self completed succesfully');
    } else {
        console.log('[bud] build self completed with error');
    }
}
