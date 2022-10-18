import * as fs from 'fs';

// config: not to be tracked environment related items
// 
// files
// - akaric: a json config file beside akari (local) executable, not tracked by version control,
//   some of the items are directly text replaced by tools/typescript when reading source file,
//   so that they does not need these items at runtime
// - src/core/config, a json config file which will be deployed beside core module executable (webroot/config)
//   will be used by core module and akari (server) at runtime
// 
// items
// - domain (in akaric): the ssh host and api service location (api.domain.com),
//   used in all targets and many documents, will be replaced by tools/typescript
// - webroot (in akaric): the web root absolute path, used in all targets, will be replaced by tools/typescript
// - codebook (in akaric): ?, used in akari (local)
// - ssh (in akaric): { user, identity, passphrase } only used in akari (local)
// - apps (in akaric): { name, origin, devrepo, socket }[],
//   used in authentication (core module), and as akari (app)'s deploy location (akari (local)),
//   will be specially replaced by tools/typescript
// - codebook (in src/core/config): ?, used in akari (server)
// - static-content (in src/core/config):
//   this was in akaric before, but it is large compare to other single string items, and changes
//   frequently in early development phase while watch core cannot hot reload this file, so it is moved
//   to a runtime config file beside core module executable file, and changes old disable-content admin
//   command to a more simple reload-config command, see src/core/content.ts for more detail
// - ssl (in src/core/config): { key: cert, fullchain }, used in core module and akari (server) for https
// - database (in src/core/config): mysql.PoolConfig, used in core module,
//   note that for app servers, as standalone services, have different database connection setting
//   (database is not same) and may include other config items in their own config file

interface Config {
    domain: string,
    webroot: string,
    codebook: string,
    ssh: { user: string, identity: string, passphrase: string },
    apps: { name: string, origin: string, devrepo: string, socket: string }[],
}
export const config = JSON.parse(fs.readFileSync('akaric', 'utf-8')) as Config;
