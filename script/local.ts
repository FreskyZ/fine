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

} else {
    console.log('unknown command');
    process.exit(1);
}

// this is moved from common because it seems not suitable for fpsd
process.on('unhandledRejection', error => { 
    console.log('unhandled reject: ', error);
    process.exit(0);
});

// TODO
// confirm use websocket I still can use normal https request response handling
// test send command, test send encrypted command, test download encryption key to encrypt command
// integrite server-core, web-page, app-server, app-client with new deployment and reload feature
// public target direct to deploy, remove clean target, remove dist folder from local, remove dist from gitignore
// new client-dev script, integrite and test with app-client, try the reload css machenism

// add edit feature to wimm!

// add (c) and (s) to watch -both log header, continue improve log format
// add basic eslint to self, server-core, web-page, app-server and app-client, all as warnings
// develop local log viewing web page, download log through ssh, host on remote-wsl, browser tab open on win32
// move error stack parser and source map map from server-core into log viewing web page
