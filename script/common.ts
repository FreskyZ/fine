import * as fs from 'fs';
import * as chalk from 'chalk';
import * as dayjs from 'dayjs';
import { AdminPayload } from '../src/shared/types/admin';

declare global { interface String { replaceAll(searchValue: string | RegExp, replaceValue: string): string } }

// this config is read runtime and replace for build normal things
// so build script itself directly use this instead of replace it while building self
export const getCompileTimeConfig = () => JSON.parse(fs.readFileSync('akari.config', 'utf-8'));

// current color schema
// error: red
// target name: cyan
// watching (the long displayed long message): blue 

export function logInfo(header: string, message: string, error?: any) {
    if (error) {
        console.log(chalk`[{green ${dayjs().format('HH:mm:ss.SSS')}} {gray ${header}}] ${message}`, error);
    } else {
        console.log(chalk`[{green ${dayjs().format('HH:mm:ss.SSS')}} {gray ${header}}] ${message}`);
    }
}
export function logError(header: string, message: string, error?: any) {
    if (error) {
        console.log(chalk`[{green ${dayjs().format('HH:mm:ss.SSS')}} {red ${header}}] ${message}`, error);
    } else {
        console.log(chalk`[{green ${dayjs().format('HH:mm:ss.SSS')}} {red ${header}}] ${message}`);
    }
}
export function logCritical(header: string, message: string) {
    console.log(chalk`[{green ${dayjs().format('HH:mm:ss.SSS')}} {red ${header}}] ${message}`);
    return process.exit(1);
}

export function formatAdminPayload(payload: AdminPayload) {
    switch (payload.type) {
        case 'ping': return 'ping';
        case 'shutdown': return 'shutdown';
        case 'webpage': switch (payload.data.type) {
            case 'reload-js': return 'reload-js';
            case 'reload-css': return 'reload-css';
        } 
        case 'content': switch (payload.data.type) {
            case 'reload-client': return `reload-client ${payload.data.app}`;
            case 'reload-page': return `reload-page ${payload.data.pagename}`;
            case 'enable-source-map': return `source-map enable`;
            case 'disable-source-map': return `source-map disable`;
            case 'set-websocket-port': return `websocket-port ${payload.data.port}`;
        }
        case 'auth': switch(payload.data.type) {
            case 'reload-server': return `reload-server ${payload.data.app}`;
            case 'enable-signup': return `enable-signup`;
            case 'disable-signup': return `disable-signup`;
            default: return JSON.stringify(payload.data); // TODO
        }
        default: return JSON.stringify(payload);
    }
}
