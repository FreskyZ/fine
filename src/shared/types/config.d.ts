// declare global variables in maka.config, to make vscode happy
// because they are replaced before tsc read, so this don't make tsc happy
import type { PoolConfig } from 'mysql';

declare global {
    const SSL_KEY: string;
    const SSL_CERT: string;
    const WEBROOT: string;
    const DOMAIN_NAME: string;
    const APP_NAMES: string[];
    const CONNECTION_STRING: PoolConfig; // although this is an object, name it connection string
}
