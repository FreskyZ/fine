import { default as runSelf } from './build-self';
import { default as runServerCore } from './build-server-core';
import { default as runHomePage } from './build-home-page';

if (process.argv.length != 3) {
    console.log('invalid command line: invalid parameter count');
    process.exit(0);
}

const target = process.argv[2];
if (target == 'self') {
    runSelf();
} else if (target == 'server-core') {
    runServerCore(false);
} else if (target == 'home-page') {
    runHomePage(false);
} else {
    console.log('invalid command line: unknown target');
    process.exit(0);
}
