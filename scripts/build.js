const minimist = require('minimist');
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

const target = process.argv[2];

const [targetName, targetType] = target == 'server' ? ['server', 'server']
    : target.endsWith('-page') ? [target.slice(0, -5), 'page']
    : target.endsWith('-app') ? [target.slice(0, -4), 'app']
    : (() => { throw new Error('invalid target'); })();

console.log({ targetName, targetType });

const argv = minimist(process.argv.slice(3));
console.dir(argv);
