import * as readline from 'readline';
import { admin } from './tools/admin';
import { build as buildSelf, hashself } from './targets/self';
import { build as buildSelfServer } from './targets/server';
import { build as buildCore, uploadConfig } from './targets/core';
import { build as buildPublic } from './targets/public';
import { build as buildStatic } from './targets/static';

process.on('unhandledRejection', error => {
    console.log('unhandled reject: ', error);
    process.exit(0);
});

function calladmin(result: Promise<boolean>) {
    result.then(result => process.exit(result ? 0 : 1));
}
function dispatch(args: string) {
    /**/ if (args == 'self') { buildSelf(); }
    else if (args == 'self server') { buildSelfServer(); }
    else if (args == 'public') { buildPublic(); }
    else if (args == 'core') { buildCore(false); }
    else if (args == 'watch core') { buildCore(true); }
    else if (args == 'home-page') { buildStatic('home', false); }
    else if (args == 'watch home-page') { buildStatic('home', true); }
    else if (args == 'user-page') { buildStatic('user', false); }
    else if (args == 'watch user-page') { buildStatic('user', true); }

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

    // content
    else if (/^reload-static [\w\\\.]+$/.test(args)) { calladmin(admin.core({ type: 'content', sub: { type: 'reload-static', key: args.slice(14) } })) }
    else if (args == 'disable-source-map') { calladmin(admin.core({ type: 'content', sub: { type: 'disable-source-map' } })) }
    else if (args == 'enable-source-map') { calladmin(admin.core({ type: 'content', sub: { type: 'enable-source-map' } })) }

    // upload config and reload config for static content
    else if (args == 'config') { uploadConfig().then(() => calladmin(admin.core({ type: 'content', sub: { type: 'reload-config' } }))) }

    else { console.log('unknown command'); process.exit(1); }
}

const args = [process.argv[2], process.argv[3]].filter(a => a).join(' '); // 0 is node, 1 is akari

hashself().then(h => {
    if (!args.startsWith('self') && h != "selfhash") {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question('script source code may be changed after last bootstrap, continue? (y|n): ', answer => {
            if (answer != 'y' && answer != 'Y') {
                process.exit(2);
            } else {
                dispatch(args);
            }
        });
    } else {
        dispatch(args);
    }
});
