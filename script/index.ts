import { send } from './admin-base';
import { build as buildSelf } from './build-self';
import { build as buildServerCore } from './build-server-core';
import { build as buildHomePage } from './build-home-page';

const argv = process.argv.slice(2);

if (argv[0] == 'self') {
    buildSelf();
} else if (argv[0] == 'server-core') {
    buildServerCore(false);
} else if (argv[0] == 'watch' && argv[1] == 'server-core') {
    buildServerCore(true);
} else if (argv[0] == 'home-page') {
    buildHomePage(false);
} else if (argv[0] == 'watch' && argv[1] == 'home-page') {
    buildHomePage(true);
} else if (argv[0] == 'shutdown') {
    send({ type: 'shutdown' }).then(() => process.exit(0)); // send and die or directly let unhandled rejection die
} else if (argv[0] == 'content-update' && argv.length == 3) {
    send({ type: 'content-update', parameter: { app: argv[1], name: argv[2] } }).then(() => process.exit(0));
} else {
    console.log('unknown command');
}
