import { admin } from './tools/admin';
import { build as buildAppServer, uploadConfig, deployADK } from './targets/app-server';
import { build as buildAppClient } from './targets/app-client';

// akari (app) entry, see docs/build-script.md

function calladmin(result: Promise<boolean>) {
    result.then(result => process.exit(result ? 0 : 1));
}
process.on('unhandledRejection', error => { console.log('unhandled reject: ', error); process.exit(0); });

const args = [process.argv[2], process.argv[3]].filter(a => a).join(' '); // 0 is node, 1 is akari

// client, server
if (args == 'ui') { buildAppClient(false); }
else if (args == 'core') { buildAppServer(false); }
else if (args == 'both') { buildAppClient(false, 'c'); buildAppServer(false, 's'); }
else if (args == 'watch ui') { buildAppClient(true); }
else if (args == 'watch core') { buildAppServer(true); }
else if (args == 'watch both') { buildAppClient(true, 'c'); buildAppServer(true, 's'); }

// content
else if (/^reload-static [\w\\\.]+$/.test(args)) { calladmin(admin.core({ type: 'content', sub: { type: 'reload-static', key: args.slice(14) } })) }
else if (args == 'disable-source-map') { calladmin(admin.core({ type: 'content', sub: { type: 'disable-source-map' } })) }
else if (args == 'enable-source-map') { calladmin(admin.core({ type: 'content', sub: { type: 'enable-source-map' } })) }

// ADK
else if (args == 'adk') { deployADK(); }
// upload config
else if (args == 'config') { uploadConfig(); }

else { console.log('unknown command'); process.exit(1); }
