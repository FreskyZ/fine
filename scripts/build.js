#!/usr/bin/env node

const fs = require('fs');
const chalk = require('chalk');
const MemoryFS = require('memory-fs');
const TypeScriptRunner = require('./typescript_runner');
const WebpackRunner = require('./webpack_runner');
const SourceMapMerger = require('./source_map_merger');
const Reporter = require('./reporter');
const buildTarget = require('./build_target')();

// build index-page --watch
// build logs-page --watch
// build blog-app [--dev | --pro]
// build cost-app --watch
// build drive-app
// build server [--watch] [--dev | --pro]

// web pages and web apps names are auto
// web page's entry is 'src/client/<name>.ts' and 'src/client/<name>.less'
// web app's entry is 'src'client<name>/app.tsx'

const reporter = new Reporter('common');

function buildServer(options) {
    const mfs = new MemoryFS();
    const tsc = new TypeScriptRunner({ configName: 'server' });
    const wpc = new WebpackRunner({ configName: 'server' });
    const smm = new SourceMapMerger({ configName: 'server' });

    wpc.on('bundle-success', async (stat) => {
        await smm.merge({ fileSystem: mfs });

        fs.writeFileSync('build/server.js', mfs.readFileSync('/dummy-build/server.js'));
        fs.writeFileSync('build/server.js.map', mfs.readFileSync('/dummy-build/server.js.map.2'));
        reporter.writeWithHeader('write to physical file system');
    });

    if (!options.watch) {
        if (tsc.run({ outputFileSystem: mfs })) {
            wpc.run({ fileSystem: mfs });
        }
    } else { // watch
        tsc.on('after-watch-recompile', () => {
            wpc.run({ fileSystem: mfs });
        });
        tsc.watch({ outputFileSystem: mfs });
    } 
}

function main() {
    if (buildTarget.name == 'server') buildServer(buildTarget.options);
    else console.log(chalk`{red error}: unknown target name ${buildTarget.name}`);
}

main();

