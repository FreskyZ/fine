import type { PoolConfig } from 'mysql';

// see script/config.ts
// declare akaric global variables, to make vscode happy

declare global {
    const APP_NAMES: string[];
    const MYSQL_CONNECTION_STRING: PoolConfig;
}
