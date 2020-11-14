import { default as runServerCore } from './build-server-core';
import { default as runHomePage } from './build-home-page';

if (process.argv.length != 3) {
    console.log('invalid command line: invalid parameter count');
    process.exit(0);
}

const target = process.argv[2];
if (target == 'server-core') {
    runServerCore(true);
} else if (target == 'home-page') {
    runHomePage(true);
} else {
    console.log('invalid command line: unknown target');
    process.exit(0);
}
