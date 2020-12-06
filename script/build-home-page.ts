import * as fs from 'fs';
import * as ts from './run-typescript';
import * as sass from 'node-sass';
import * as admin from './admin-base';

const typescriptEntry = 'src/home-page/index.ts';
const typescriptOptions = {
    types: ['node'],
    outDir: 'build/home-page',
    lib: ['lib.dom.d.ts'],
    writeFileHook: (fileName, data, writeBOM, onError, sourceFiles, originalWriteFile) => {
        if (fileName != 'build/home-page/index.js') {
            return originalWriteFile(fileName, data, writeBOM, onError, sourceFiles); // // will this happen?
        }
        redirectWriteFileAndRemoveHeadingLines(data);
    },
    watchWriteFileHook: (fileName, data, writeBOM, originalWriteFile) => {
        if (fileName != 'build/home-page/index.js') {
            return originalWriteFile(fileName, data, writeBOM);
        }
        redirectWriteFileAndRemoveHeadingLines(data);
        console.log('[bud] reload index.js');
        admin.send({ type: 'content-update', parameter: { app: 'www', name: 'index.js' } }).catch(() => { /* ignore */});
    },
} as ts.CompilerOptions;

const sassOptions: sass.Options = {
    file: 'src/home-page/index.sass',
    outputStyle: 'compressed',
}

function redirectWriteFileAndRemoveHeadingLines(data: string) {
    // typescript unexpectedly and maybe unconfigurably add not-used "use strict" 
    // and cause-error "Object.defineProperty(exports, '__esModule')" to emitted file after "import type from 'shared'" added
    // remove them and directly output to dist folder as write file hook feature is used
    const line1End = data.indexOf('\n');
    const line2End = data.indexOf('\n', line1End + 1);
    fs.writeFileSync('dist/home/client.js', data.slice(line2End + 1));
}

// directly call sass only happens in home page while app front end uses formal webpack ts loader and sass loader
async function transpileSass(): Promise<void> {
    console.log(`[css] transpiling ${sassOptions.file}`);

    return new Promise((resolve, reject) => {
        sass.render(sassOptions, (error, result) => {
            if (error) {
                console.log(`[css] error at ${sassOptions.file}:${error.line}:${error.column}: ${error.message}`);
                reject();
                return;
            }
            fs.writeFileSync('dist/home/index.css', result.css);
            console.log(`[css] transpiled completed successfully in ${result.stats.duration}ms`);
            resolve();
        });
    });
}

async function buildOnce() {
    console.log('[bud] building home-page');
    // although these 3 things can be done in parallel, sequential them to prevent output mess

    // js
    if (!ts.compile(typescriptEntry, typescriptOptions)) {
        console.log('[bud] build home-page failed at transpiling script');
        return;
    }
    await admin.send({ type: 'content-update', parameter: { app: 'www', name: 'index.js' } });

    // css
    try {
        await transpileSass();
        await admin.send({ type: 'content-update', parameter: { app: 'www', name: 'index.css' } });
    } catch {
        console.log('[bud] build home-page failed at transpiling stylesheet');
        return;
    }

    // html
    console.log(`[cpy] copy index.html`);
    fs.copyFileSync('src/home-page/index.html', 'dist/home/index.html');
    await admin.send({ type: 'content-update', parameter: { app: 'www', name: 'index.html' } });

    console.log('[bud] build home-page completed succesfully');   
}

function buildWatch() {
    console.log('[bud] building watching home-page');

    ts.watch(typescriptEntry, typescriptOptions);

    let htmlOperationIndex = 0; // add an index to message or else when continuing updating this one file output message will seem not moving (same one line content)
    fs.watchFile('src/home-page/index.html', { persistent: false }, (currstat, prevstat) => {
        if (currstat.mtime == prevstat.mtime) {
            return;
        }
        htmlOperationIndex += 1;
        console.log(`[cpy] copy and reload index.html #${htmlOperationIndex}`);
        fs.copyFileSync('src/home-page/index.html', 'dist/home/index.html');
        admin.send({ type: 'content-update', parameter: { app: 'www', name: 'index.html' } }).catch(() => { /* ignore */});
    });
    console.log('[bud] index.html fs watcher setup');

    let cssOperationIndex = 0;
    fs.watchFile('src/home-page/index.sass', { persistent: false }, (currstat, prevstat) => {
        if (currstat.mtime == prevstat.mtime) {
            return;
        }
        transpileSass().then(() => {
            cssOperationIndex += 1;
            console.log(`[bud] reload index.css #${cssOperationIndex}`);
            admin.send({ type: 'content-update', parameter: { app: 'www', name: 'index.css' } }).catch(() => { /* ignore */});
        }).catch(() => { /* error already reported, ignore */});
    });
    console.log('[bud] index.sass fs watcher setup');

    process.on('SIGINT', () => {
        fs.unwatchFile('build/home-page/index.js');
        fs.unwatchFile('src/home-page/index.html');
        fs.unwatchFile('src/home-page/index.sass');
        process.exit(0);
    });
}

export async function build(watch: boolean): Promise<void> {
    if (watch) {
        buildWatch();
    } else {
        buildOnce();
    }
}
