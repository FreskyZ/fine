import { send } from './admin-base';
import { build as buildSelf } from './build-self';
import { build as buildServerCore } from './build-server-core';
import { build as buildHomePage } from './build-home-page';

function buildAppClient(_name: string, _watch: boolean) {}
function buildAppServer(_name: string, _watch: boolean) {}

function validateApp(appname: string) { 
    if (['ak', 'collect', 'cost'].includes(appname)) {
        return appname;
    } else {
        console.log('unknown app name');
        process.exit(1);
    }
}

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
} else if (argv[0].endsWith('-client')) {
    buildAppClient(validateApp(argv[0].slice(0, -7)), false);
} else if (argv[0].endsWith('-server')) {
    buildAppServer(validateApp(argv[0].slice(0, -7)), false);
} else if (argv[0] == 'watch' && argv[1].endsWith('-client')) {
    buildAppClient(validateApp(argv[1].slice(0, -7)), true);
} else if (argv[0] == 'watch' && argv[1].endsWith('-server')) {
    buildAppServer(validateApp(argv[1].slice(0, -7)), true);
} else if (argv[0] == 'watch' && argv[1]) {
    // watch both
    buildAppClient(validateApp(argv[1]), true);
    buildAppServer(validateApp(argv[1]), true);
} else if (argv[0] == 'update-content' && argv.length == 3) {
    send({ type: 'content-update', parameter: { app: argv[1], name: argv[2] } }).then(() => process.exit(1)); // send and die or directly let unhandled rejection die
} else if (argv[0] == 'expire-device' && argv.length == 2) {
    // send({ type: 'expire-device', parameter: { deviceId: parseInt(argv[2]) } }).then(() => process.exit(1))
} else if (argv[0] == 'shutdown') {
    send({ type: 'shutdown' }).then(() => process.exit(1));
} else {
    console.log('unknown command');
    process.exit(1);
}
