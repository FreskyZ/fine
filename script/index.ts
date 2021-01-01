import { build as buildSelf } from './targets/self';
import { build as buildPublic } from './targets/public';
import { build as buildServerCore } from './targets/server-core';
import { build as buildSimplePage } from './targets/web-page';
import { build as buildAppServer } from './targets/app-server';
import { build as buildAppClient } from './targets/app-client';
import { viewlog } from './targets/view-log';
import { admin } from './tools/admin';

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

const [a1, a2] = [process.argv[2] || '', process.argv[3] || '']; // 0 is node, 1 is akari
if (a1 == 'self') {
    buildSelf();
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
    buildAppClient(validateApp(a2.slice(0, -5)), true, '(c)');
    buildAppServer(validateApp(a2.slice(0, -5)), true, '(s)');

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

} else if (a1 == 'service' && a2 == 'start') {
    admin.servicehost('start').then(result => process.exit(result ? 1 : 0));
} else if (a1 == 'service' && a2 == 'status') {
    admin.servicehost('status').then(result => process.exit(result ? 1 : 0));
} else if (a1 == 'service' && a2 == 'stop') {
    admin.servicehost('stop').then(result => process.exit(result ? 1 : 0));
} else if (a1 == 'service' && a2 == 'restart') {
    admin.servicehost('restart').then(result => process.exit(result ? 1 : 0));
} else if (a1 == 'service' && a2 == 'is-active') {
    admin.servicehost('is-active').then(result => process.exit(result ? 1 : 0));

} else if (a1 == 'stop-self-host') { // reserved in case it does not stop
    admin.selfhost('stop').then(result => process.exit(result ? 1 : 0));

} else if (a1 == 'viewlog') {
    viewlog(a2);

} else {
    console.log('unknown command');
    process.exit(1);
}

// this is moved from common because it seems not suitable for fpsd
process.on('unhandledRejection', error => {
    console.log('unhandled reject: ', error);
    process.exit(0);
});
