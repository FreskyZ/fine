import * as fs from 'fs';

// akari config
// it contain things that should not be tracked by version control, like ssl files, ssh files, connection strings and domain name
// it is stored in `akaric` beside akari (local) executable file, it is not available for akari (server), which contains json with type `Record<string, string>`
//
// tools/typescript use this config to replace some variables at compile time, as they are not considered change while running or without redeployment
// akari (server) use this feature and variables are replaced then packed and deployed
// akari (local) is not and should not use this feature because akari (local) executable file is tracked by version control
// this module is included only by akari (local) and has paid attention that not accidentally replaced by tools/typescript
//
// currently these items are used
// - APP_NAMES  // csv, will be replaced as array of string literal
// - domain.com // string
// - WEBROOT    // deploy location
// - CODEBOOK   // ?
// - ssl: SSL-KEY, SSL-CERT, SSL-FULLCHAIN       // all file paths
// - ssh: SSH-USER, SSH-IDENTITY, SSH-PASSPHRASE // string, file path, string
// - db: MYSQL_CONNECTION_STRING                 // mysql.createPool parameter
// the can-be-variable names are designed to be used as variable, e.g. mysql.createPool(MYSQL_CONNECTION_STRING)
// the cannot-be-variable names are designed to be used in string literal, e.g. { key: fs.readFileSync('SSL-KEY'), cert: fs.readFileSync('SSL-CERT') }

class Config {
    private readonly values: Record<string, string>;
    public readonly items: { name: string, value: string }[];

    // these are used inside akari (local)
    public readonly apps: string[];
    public readonly domain: string;
    public readonly webroot: string;
    public readonly codebook: string;
    public readonly ssh: { user: string, identity: string, passphrase: string };

    public constructor() {
        this.values = JSON.parse(fs.readFileSync('akaric', 'utf-8'));
        this.items = Object.entries(this.values)
            .map<{ name: string, value: string }>(([name, value]) => name == ['APP', 'NAMES'].join('_') ? { name, value: `[${value.split(',').map(v => `'${v}'`).join(', ')}]` } : { name, value });

        this.apps = this.values[['APP', 'NAMES'].join('_')].split(',');
        this.domain = this.values[['domain', 'com'].join('.')];
        this.webroot = this.values[['WEB', 'ROOT'].join('')];
        this.codebook = this.values[['CODE', 'BOOK'].join('')];
        this.ssh = {
            user: this.values[['SSH', 'USER'].join('-')],
            identity: this.values[['SSH', 'IDENTITY'].join('-')],
            passphrase: this.values[['SSH', 'PASSPHRASE'].join('-')],
        };
    }
}
export const config = new Config();
