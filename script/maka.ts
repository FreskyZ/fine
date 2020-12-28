import { admin } from './tools/admin';
import { build as buildSelf } from './targets/self';
import { build as buildPublic, cleanAll } from './targets/public';
import { build as buildServerCore } from './targets/server-core';
import { build as buildSimplePage } from './targets/web-page';
import { build as buildAppServer } from './targets/app-server';
import { build as buildAppClient } from './targets/app-client';

function validatePage(pagename: string) {
    if (['home', 'user', '404', '418'].includes(pagename)) {
        return pagename;
    } else {
        console.log('unknown page name');
        process.exit(1);
    }
}
function validateApp(appname: string) { 
    if (['cost', 'collect', 'ak'].includes(appname)) {
        return appname;
    } else {
        console.log('unknown app name');
        process.exit(1);
    }
}

const [a1, a2] = [process.argv[2], process.argv[3]]; // 0 is node, 1 is maka
if (a1 == 'self') {
    buildSelf();
} else if (a1 == 'clean') {
    cleanAll();
} else if (a1 == 'public') {
    buildPublic();

} else if (a1 == 'server-core') {
    buildServerCore(false);
} else if (a1 == 'watch' && a2 == 'server-core') {
    buildServerCore(true);

} else if (a1.endsWith('-page')) {
    buildSimplePage(validatePage(a1.slice(0, -5)), false);
} else if (a1 == 'watch' && a2.endsWith('-page')) {
    buildSimplePage(validatePage(a2.slice(0, -5)), true);
} else if (a1.endsWith('-client')) {
    buildAppClient(validateApp(a1.slice(0, -7)), false);
} else if (a1 == 'watch' && a2.endsWith('-client')) {
    buildAppClient(validateApp(a2.slice(0, -7)), true);
} else if (a1.endsWith('-server')) {
    buildAppServer(validateApp(a1.slice(0, -7)), false);
} else if (a1 == 'watch' && a2.endsWith('-server')) {
    buildAppServer(validateApp(a2.slice(0, -7)), true);

} else if (a1 == 'watch' && a2.endsWith('-both')) { // both client and server
    buildAppClient(validateApp(a2.slice(0, -5)), true);
    buildAppServer(validateApp(a2.slice(0, -5)), true);

} else if (a1 == 'all') {
    buildPublic();
    buildServerCore(false);
    buildSimplePage('home', false);
    buildSimplePage('user', false);
    buildSimplePage('404', false);
    buildSimplePage('418', false);
    buildAppServer('cost', false);
    buildAppClient('cost', false);
    buildAppClient('ak', false);

} else if (a1 == 'shutdown') {
    admin({ type: 'shutdown' }).then(() => process.exit(1)); // send and die or directly let unhandled rejection die
} else if (a1 == 'reload-static') {
    admin({ type: 'reload-static', key: a2 == 'home' || a2 == 'user' ? a2 : validateApp(a2) }).then(() => process.exit(1));
} else if (a1 == 'source-map') { // only source map is available in command line, because websocket server is opened by watch app-client, where auto enables and sends port
    admin({ type: 'config-devmod', sourceMap: a2 == 'enable' }).then(() => process.exit(1));
} else if (a1 == 'reload-server') {
    admin({ type: 'reload-server', app: validateApp(a2) }).then(() => process.exit(1));
} else if (a1 == 'expire-device') {
    admin({ type: 'expire-device', deviceId: parseInt(a2) }).then(() => process.exit(1));
} else {
    console.log('unknown command');
    process.exit(1);
}
