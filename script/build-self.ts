import * as fs from 'fs';
import * as path from 'path';
import { minify } from 'terser';
import * as ts from './run-typescript';

// $ tsc script/index.ts --outDir build/self --lib ES2020 --target ES2020 --module commonjs --moduleResolution node
// $ node build/self/index.js self

const typescriptEntry = ['script/index.ts'];
const typescriptOptions = {
    types: ['node'],
    outDir: 'script/bin',
} as ts.CompilerOptions;

type IntermediateFiles = { name: string, content: string }[];
function createWriteFileHook(intermediateFiles: IntermediateFiles) {
    return ((name: string, content: string) => {
        name = path.basename(name).slice(0, -3); // Attention: assume build script file structure is plain (no sub folder), assume all .js
        content = content.slice(content.indexOf('\n', content.indexOf('\n') + 1) + 1); // remove not used "use strict", exports.__esModule
        if (content.startsWith('exports.')) { content = content.slice(content.indexOf('\n') + 1); } // remove not used init exports to undefined
        content = content.split(/}\s*else/).join('} else'); // fix right bracket
        content = content.split('requir' /* or else this string itself will be replaced */ + 'e("./').join('myrequire("')

        intermediateFiles.push({ name, content });
    }) as ts.CompilerOptions['writeFileHook'];
}

export async function build() {
    console.log('[bud] building self');

    const intermediateFiles: IntermediateFiles = [];
    if (!ts.compile(typescriptEntry, { ...typescriptOptions, writeFileHook: createWriteFileHook(intermediateFiles) } as ts.CompilerOptions)) {
        console.log('[bud] build self failed at transpiling');
        process.exit(1);
    }

    // this is how a simpliest bundler works (amazingly this supports input memfs)
    const bundled = `#!/usr/bin/env node\n` 
        + `((modules) => { const mycache = {};\n`
        + `(function myrequire(name) { if (!(name in mycache)) { mycache[name] = {}; modules[name](mycache[name], myrequire); } return mycache[name]; })('index'); })({\n`
        + `${intermediateFiles.map(({ name, content }) => `'${name}': (exports, myrequire) => {\n${content}}`)}\n})\n`;

    const { code: minified } = await minify(bundled, {});

    fs.writeFileSync('maka', minified);
    console.log('[bud] build self completed successfully');
}
