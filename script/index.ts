import { admin } from './admin';
import { build as buildSelf } from './build-self';
import { build as buildServerCore } from './build-server-core';
import { build as buildSimplePage } from './build-simple-page';
import { build as buildAppServer } from './build-app-server';
import { build as buildAppClient } from './build-app-client';

function validateApp(appname: string) { 
    if (APP_NAMES.includes(appname)) {
        return appname;
    } else {
        console.log('unknown app name');
        process.exit(1);
    }
}

const [a1, a2] = [process.argv[2], process.argv[3]]; // 0 is node, 2 is maka
if (a1 == 'self') {
    buildSelf();
} else if (a1 == 'server-core') {
    buildServerCore(false);
} else if (a1 == 'watch' && a2 == 'server-core') {
    buildServerCore(true);
} else if (a1 == 'index-page') {
    buildSimplePage('index', false);
} else if (a1 == 'watch' && a2 == 'index-page') {
    buildSimplePage('index', true);
} else if (a1 == 'login-page') {
    buildSimplePage('login', false);
} else if (a1 == 'watch' && a2 == 'login-page') {
    buildSimplePage('login', true);
} else if (a1.endsWith('-client')) {
    buildAppClient(validateApp(a1.slice(0, -7)), false);
} else if (a1.endsWith('-server')) {
    buildAppServer(validateApp(a1.slice(0, -7)), false);
} else if (a1 == 'watch' && a2.endsWith('-client')) {
    buildAppClient(validateApp(a2.slice(0, -7)), true);
} else if (a1 == 'watch' && a2.endsWith('-server')) {
    buildAppServer(validateApp(a2.slice(0, -7)), true);
} else if (a1 == 'watch' && a2) {
    // watch both
    buildAppClient(validateApp(a2), true);
    buildAppServer(validateApp(a2), true);
} else if (a1 == 'shutdown') {
    admin({ type: 'shutdown' }).then(() => process.exit(1));
} else if (a1 == 'reload-static') {
    admin({ type: 'reload-static', key: a2 == 'www' || a2 == 'login' ? a2 : validateApp(a2) }).then(() => process.exit(1)); // send and die or directly let unhandled rejection die
} else if (a1 == 'reload-server') {
    admin({ type: 'reload-server', app: validateApp(a2) }).then(() => process.exit(1));
} else if (a1 == 'expire-device') {
    admin({ type: 'expire-device', deviceId: parseInt(a2) }).then(() => process.exit(1));
} else {
    console.log('unknown command');
    process.exit(1);
}
