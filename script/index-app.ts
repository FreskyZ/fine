import { admin } from './tools/admin';
import { build as buildAppServer } from './targets/app-server';
import { build as buildAppClient } from './targets/app-client';

// akari (app) entry, see docs/build-script.md

function calladmin(result: Promise<boolean>) {
    result.then(result => process.exit(result ? 0 : 1));
}
process.on('unhandledRejection', error => { console.log('unhandled reject: ', error); process.exit(0); });

const args = [process.argv[2], process.argv[3]].filter(a => a).join(' '); // 0 is node, 1 is akari

// app client, app server
if (args == 'client') { buildAppClient(args.slice(0, -7), false); }
else if (args == 'server') { buildAppServer(args.slice(0, -7), false); }
else if (args == 'both') { buildAppClient(args.slice(0, -5), false, 'c'); buildAppServer(args.slice(0, -5), false, 's'); }
else if (args == 'watch client') { buildAppClient(args.slice(6, -7), true); }
else if (args == 'watch server') { buildAppServer(args.slice(6, -7), true); }
else if (args == 'watch both') { buildAppClient(args.slice(6, -5), true, 'c'); buildAppServer(args.slice(6, -5), true, 's'); }

// service host
else if ('service start' == args) { calladmin(admin.service('start')); }
else if ('service stop' == args) { calladmin(admin.service('stop')); }
else if ('service status' == args) { calladmin(admin.service('status')); }
else if ('service restart' == args) { calladmin(admin.service('restart')); }

// content
else if (/^reload-static [\w\\\.]+$/.test(args)) { calladmin(admin.core({ type: 'content', sub: { type: 'reload-static', key: args.slice(14) } })) }
else if (args == 'disable-source-map') { calladmin(admin.core({ type: 'content', sub: { type: 'disable-source-map' } })) }
else if (args == 'enable-source-map') { calladmin(admin.core({ type: 'content', sub: { type: 'enable-source-map' } })) }

else { console.log('unknown command'); process.exit(1); }
