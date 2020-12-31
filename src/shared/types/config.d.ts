// declare global variables in akari.config, to make vscode happy
// because they are replaced before tsc read, so this don't make tsc happy
import type { PoolConfig } from 'mysql';

declare global {
    // these string configs should be wrapped with quote when use
    // this makes write config easier (no need to \") and vscode a little happier (less global variable and less ///<reference)
    // const SSL_KEY: string;
    // const SSL_CERT: string;
    // const WEBROOT: string;
    // const DOMAIN_NAME: string;
    const APP_NAMES: string[];
    const CONNECTION_STRING: PoolConfig; // although this is an object, name it connection string
}
