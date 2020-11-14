import * as fs from 'fs';
import * as ts from './run-typescript';
import * as sass from 'node-sass';
import * as admin from './admin-base';

const typescriptEntry = 'src/home-page/index.ts';
const typescriptOptions: ts.CompilerOptions = {
    types: ['node'],
    outDir: 'build/home-page',
    lib: ['lib.dom.d.ts'],
};
const sassOptions: sass.Options = {
    file: 'src/home-page/index.sass',
    outputStyle: 'compressed',
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
    fs.copyFileSync('build/home-page/index.js', 'dist/home/client.js');

    // css
    try {
        await transpileSass();
    } catch {
        console.log('[bud] build home-page failed at transpiling stylesheet');
        return;
    }

    // html
    console.log(`[cpy] copy index.html`);
    fs.copyFileSync('src/home-page/index.html', 'dist/home/index.html');

    // reload files
    console.log('[bud] reload build result');
    Promise.all([
        admin.send({ type: 'reload', parameter: { type: 'index', name: 'www' } }),
        admin.send({ type: 'reload', parameter: { type: 'static', name: 'index.js' } }),
        admin.send({ type: 'reload', parameter: { type: 'static', name: 'index.css' } }),
    ]).then(() => {
        console.log('[bud] build home-page completed succesfully');
    }).catch(() => {
        console.log('[bud] reload build result have some error');
    }).finally(() => {
        process.exit(0);
    });
}

function buildWatch() {
    console.log('[bud] building watching home-page');

    ts.watch(typescriptEntry, typescriptOptions);
    fs.watchFile('build/home-page/index.js', { persistent: false }, (currstat, prevstat) => {
        if (currstat.mtime == prevstat.mtime) {
            return;
        }
        console.log('[bud] copy and reload index.js');
        fs.copyFileSync('build/home-page/index.js', 'dist/home/client.js');
        admin.send({ type: 'reload', parameter: { type: 'static', name: 'index.js' } });
    });

    let operationIndex = 0; // add an index to message or else when continuing updating this one file output message will seem not moving (same one line content)
    fs.watchFile('src/home-page/index.html', { persistent: false }, (currstat, prevstat) => {
        if (currstat.mtime == prevstat.mtime) {
            return;
        }
        operationIndex += 1;
        console.log(`[cpy] copy and reload index.html #${operationIndex}`);
        fs.copyFileSync('src/home-page/index.html', 'dist/home/index.html');
        admin.send({ type: 'reload', parameter: { type: 'index', name: 'www' } });
    });
    console.log('[bud] index.html fs watcher setup');

    fs.watchFile('src/home-page/index.sass', { persistent: false }, (currstat, prevstat) => {
        if (currstat.mtime == prevstat.mtime) {
            return;
        }
        transpileSass().then(() => {
            console.log(`[bud] reload index.css`);
            admin.send({ type: 'reload', parameter: { type: 'static', name: 'index.css' } });
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

export default async function build(watch: boolean): Promise<void> {
    if (watch) {
        buildWatch();
    } else {
        buildOnce();
    }
}
