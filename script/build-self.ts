import * as ts from './run-typescript';

// "build-bootstrap": "tsc script/build.ts --outDir script/bin --lib ES2020 --target ES2020 --module ES2020 --moduleResolution node --allowSyntheticDefaultImports true",

export default function run() {

    console.log('[bud] bootstrapping');
    if (ts.compile('script/build.ts', {
        types: ["node"],
        outDir: 'script/bin',
    })) {
        console.log('[bud] bootstrap completed succesfully');
    } else {
        console.log('[bud] bootstrap completed with error');
    }
}
