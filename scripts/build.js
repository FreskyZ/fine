#!/usr/bin/env node

const chalk = require('chalk');
const MemoryFS = require('memory-fs');
const TypeScriptRunner = require('./typescript_runner');
const WebpackRunner = require('./webpack_runner');
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

function buildServer(options) {
    const mfs = new MemoryFS();
    const tsc = new TypeScriptRunner({ configName: 'server' });
    const wpc = new WebpackRunner({ configName: 'server' });
    
   if (!options.watch) {
        if (tsc.run({ outputFileSystem: mfs })) {
            wpc.run({ inputFileSystem: mfs });
        }
    } else { // watch
        tsc.on('after-watch-recompile', () => {
            wpc.run({ inputFileSystem: mfs });
        });
        tsc.watch({ outputFileSystem: mfs });
    } 
}

if (buildTarget.name == 'server') buildServer(buildTarget.options);
else console.log(chalk`{red error}: unknown target name ${buildTarget.name}`);

