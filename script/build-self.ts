import * as ts from 'typescript';
import * as rts from './run-typescript';


const selfEntry = 'script/build.ts';
const adminEntry = 'script/admin.ts';
const typescriptOptions: ts.CompilerOptions = {
    types: ['node'],
    outDir: 'script/bin',
};

function runSelf() {
    // "build-bootstrap": "tsc script/build.ts --outDir script/bin --lib ES2020 --target ES2020 --module ES2020 --moduleResolution node --allowSyntheticDefaultImports true",
    console.log('[bud] bootstrapping');

    if (rts.compile(selfEntry, typescriptOptions)) {
        console.log('[bud] bootstrap completed succesfully');
    } else {
        console.log('[bud] bootstrap completed with error');
    }
}
function runAdmin() {
    console.log('[bud] building admin');

    if (rts.compile(adminEntry, typescriptOptions)) {
        console.log('[bud] build admin completed succesfully');
    } else {
        console.log('[bud] build admin completed with error');
    }
}

export default function run(type: 'self' | 'admin') {
    switch (type) {
        case 'self': { runSelf(); break; }
        case 'admin': { runAdmin(); break; }
    }
}
