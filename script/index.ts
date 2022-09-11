import { config } from './config';
import { admin } from './tools/admin';
import { build as buildSelf } from './targets/self';
import { build as buildCore } from './targets/core';
import { build as buildPublic } from './targets/public';
import { build as buildStatic } from './targets/static';
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

// core
else if ('core' == args) { buildCore(false); }
else if ('watch core' == args) { buildCore(true); }

// simple page
else if (/^\w+-page$/.test(args)) { buildStatic(validatePage(args.slice(0, -5)), false); }
else if (/^watch \w+-page$/.test(args)) { buildStatic(validatePage(args.slice(6, -5)), true); }

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
    buildCore(false);
    buildStatic('home', false);
    buildStatic('user', false);
    buildStatic('404', false);
    buildStatic('418', false);
    buildAppServer('wimm', false);
    buildAppClient('wimm', false);
}

// service host
else if ('service start' == args) { calladmin(admin.service('start')); }
else if ('service stop' == args) { calladmin(admin.service('stop')); }
else if ('service status' == args) { calladmin(admin.service('status')); }
else if ('service restart' == args) { calladmin(admin.service('restart')); }

// self-host, in case it failed to stop
else if ('stop-self-host' == args) { calladmin(admin.selfhost('stop')); }

// auth
else if ('signup enable' == args) { calladmin(admin.core({ type: 'auth', sub: { type: 'enable-signup' } })); }
else if ('signup disable' == args) { calladmin(admin.core({ type: 'auth', sub: { type: 'disable-signup' } })); }
else if (/^active-user \d+$/.test(args)) { calladmin(admin.core({ type: 'auth', sub: { type: 'activate-user', userId: parseInt(args.slice(12)) } })); }
else if (/^inactive-user \d+$/.test(args)) { calladmin(admin.core({ type: 'auth', sub: { type: 'inactivate-user', userId: parseInt(args.slice(14)) } })); }

else { console.log('unknown command'); process.exit(1); }
