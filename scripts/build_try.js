const child_process = require('child_process');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const minimist = require('minimist');
const DirectoryWatcher = require('./dir_watcher.js');

// build index-page --watch
// build logs-page --watch
// build blog-app [--dev | --pro]
// build cost-app --watch
// build drive-app
// build server

// npm run build index-page
// npm run build cost-app
// npm run build server
// npm run watch server => build server --watch
// npm run watch index-page => build index-page --watch

// web pages and web apps names are auto
// web page's entry is 'src/client/<name>.ts' and 'src/client/<name>.less'
// web app's entry is 'src'client<name>/app.tsx'

const projectDirectory = process.cwd();
const raiseError = message => { console.log(message); process.exit(0); }

function checkProcessArguments() {
    if (process.argv.length < 3) {
        raiseError(chalk`{red error}: not enough arguments`);
    }

    const target = process.argv[2];
    const [name, type] = target == 'server' ? ['server', 'server']
        : target.endsWith('-page') ? [target.slice(0, -5), 'page']
        : target.endsWith('-app') ? [target.slice(0, -4), 'app']
        : (() => { raiseError(chalk`{red error}: invalid target`); })();

    const options = minimist(process.argv.slice(3));
    return { targetName: name, targetType: type, targetOptions: options };
}

const typescriptBaseConfig = {
    'target': 'es2015',
    'alwaysStrict': 'true',
    'lib': 'esnext',
    'listEmittedFiles': 1, // 0 for boolean options
    'module': 'commonjs',
    'noEmitOnError': 1,
    'noFallthroughCasesInSwitch': 1,
    'noImplicitAny': 1,
    'noImplicitReturns': 1,
    'noImplicitThis': 1,
    'noUnusedLocals': 1,
    'noUnusedParameters': 1,
    'strict': 1,
}
const typescriptServerConfig = {
    ...typescriptBaseConfig,
    'target': 'es2017',
    'outDir': '../build/server',
    ''
}

async function exec(command) {
    console.log('> ' + chalk.bgBlackBright(command));
    const startTime = process.hrtime();
    return new Promise((resolve, reject) => child_process.exec(command, (error, stdout, stderr) => {

        if (error) console.log(` - ${chalk.red('failed')} with error code ${error.code}`);
        if (stdout) console.log(' - ' + chalk.gray('stdout:') + '\n', stdout);
        if (stderr) console.log(' - ' + chalk.gray('stderr:') + '\n', stderr);
        if (!stdout && !stderr) console.log(' - ' + chalk.gray('(no stdout and stderr)'));

        const [elapsedSecond, elapsedNanoSecond] = process.hrtime(startTime);
        const totalElapsedMilliSecond = elapsedSecond * 1000 + elapsedNanoSecond / 1000000;
        const displayElapsed = Math.round(totalElapsedMilliSecond * 1000) / 1000;
        console.log(' - ' + chalk.gray(`execute time ${displayElapsed}ms`));
        resolve();
    }));
}

const { targetName, targetType, targetOptions } = checkProcessArguments();

if (targetName == 'server') {
    const command = 'tsc --project tsconfig/server.json --noEmitOnError';
    if (!targetOptions.watch) {
        exec(command); 
        return;
    } else {
        const watcher = new DirectoryWatcher('src/server', () => exec(command));
        
        process.on('SIGINT', () => {
            watcher.stop('received sigint');
            process.exit(0);
        });
    }
}

