import { config } from './config'; 
import { admin } from './tools/admin';
import { build as buildSelf } from './targets/self';
import { build as buildPublic } from './targets/public';
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
    if (config.apps.includes(appname)) {
        return appname;
    } else {
        console.log('unknown app name');
        process.exit(1);
    }
}
function calladmin(result: Promise<boolean>) {
    result.then(result => process.exit(result ? 0 : 1));
}
process.on('unhandledRejection', error => { console.log('unhandled reject: ', error); process.exit(0); });

const args = [process.argv[2], process.argv[3]].filter(a => a).join(' '); // 0 is node, 1 is akari

// self, public
if ('self' == args) { buildSelf(); }
else if ('public' == args) { buildPublic(); }

// server-core
else if ('server-core' == args) { buildServerCore(false); }
else if ('watch server-core' == args) { buildServerCore(true); }

// simple page
else if (/^\w+-page$/.test(args)) { buildSimplePage(validatePage(args.slice(0, -5)), false); }
else if (/^watch \w+-page$/.test(args)) { buildSimplePage(validatePage(args.slice(6, -5)), true); }

// app client, app server
else if (/^\w+-client/.test(args)) { buildAppClient(validateApp(args.slice(0, -7)), false); }
else if (/^\w+-server/.test(args)) { buildAppServer(validateApp(args.slice(0, -7)), false); }
else if (/^\w+-both/.test(args)) { buildAppClient(validateApp(args.slice(0, -5)), false, 'c'); buildAppServer(validateApp(args.slice(0, -5)), false, 's'); }
else if (/^watch \w+-client/.test(args)) { buildAppClient(validateApp(args.slice(6, -7)), true); }
else if (/^watch \w+-server/.test(args)) { buildAppServer(validateApp(args.slice(6, -7)), true); }
else if (/^watch \w+-both/.test(args)) { buildAppClient(validateApp(args.slice(6, -5)), true, 'c'); buildAppServer(validateApp(args.slice(6, -5)), true, 's'); }

// all build
else if ('all' == args) {
    buildPublic();
    buildServerCore(false);
    buildSimplePage('home', false);
    buildSimplePage('user', false);
    buildSimplePage('404', false);
    buildSimplePage('418', false);
    buildAppServer('wimm', false);
    buildAppClient('wimm', false);
}

// service host
else if ('service start' == args) { calladmin(admin.servicehost('start')); }
else if ('service stop' == args) { calladmin(admin.servicehost('stop')); }
else if ('service status' == args) { calladmin(admin.servicehost('status')); }
else if ('service restart' == args) { calladmin(admin.servicehost('restart')); }

// self-host, in case it failed to stop
else if ('stop-self-host' == args) { calladmin(admin.selfhost('stop')); }

// auth
else if ('signup enable' == args) { calladmin(admin.servercore({ type: 'auth', sub: { type: 'enable-signup' } })); }
else if ('signup disable' == args) { calladmin(admin.servercore({ type: 'auth', sub: { type: 'disable-signup' } })); }
else if (/^active-user \d+$/.test(args)) { calladmin(admin.servercore({ type: 'auth', sub: { type: 'activate-user', userId: parseInt(args.slice(12)) } })); }
else if (/^inactive-user \d+$/.test(args)) { calladmin(admin.servercore({ type: 'auth', sub: { type: 'inactivate-user', userId: parseInt(args.slice(14)) } })); }

else { console.log('unknown command'); process.exit(1); }
