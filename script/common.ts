import * as fs from 'fs';
import * as chalk from 'chalk';
import * as dayjs from 'dayjs';
import type { AdminPayload } from '../src/shared/types/admin';

declare global { interface String { replaceAll(searchValue: string | RegExp, replaceValue: string): string } }

// this config is read runtime and replace for build normal things
// so build script itself directly use this instead of replace it while building self
export const getCompileTimeConfig = (): Record<string, string> => JSON.parse(fs.readFileSync('akari.config', 'utf-8'));

// current color schema
// error: red
// target name: cyan
// watching (the long displayed long message): blue

export function logInfo(header: string, message: string, error?: any): void {
    if (error) {
        console.log(chalk`[{green ${dayjs().format('HH:mm:ss.SSS')}} {gray ${header}}] ${message}`, error);
    } else {
        console.log(chalk`[{green ${dayjs().format('HH:mm:ss.SSS')}} {gray ${header}}] ${message}`);
    }
}
export function logError(header: string, message: string, error?: any): void {
    if (error) {
        console.log(chalk`[{green ${dayjs().format('HH:mm:ss.SSS')}} {red ${header}}] ${message}`, error);
    } else {
        console.log(chalk`[{green ${dayjs().format('HH:mm:ss.SSS')}} {red ${header}}] ${message}`);
    }
}
export function logCritical(header: string, message: string): never {
    console.log(chalk`[{green ${dayjs().format('HH:mm:ss.SSS')}} {red ${header}}] ${message}`);
    return process.exit(1);
}

export function watchvar(callback: () => any, options?: { interval?: number, initialCall?: boolean }): () => void {
    let requested = false;
    setInterval(() => {
        if (requested) {
            requested = false;
            callback();
        }
    }, options?.interval ?? 3001);

    if (options?.initialCall) {
        callback();
    }
    return () => requested = true;
}

export function formatAdminPayload(payload: AdminPayload): string {
    // even tsc knows return is not fallthrough, but eslint don't
    /* eslint-disable no-fallthrough */
    switch (payload.type) {
        case 'ping': return 'ping';
        case 'shutdown': return 'shutdown';
        case 'webpage': switch (payload.data) {
            case 'reload-js': return 'reload-js';
            case 'reload-css': return 'reload-css';
        }
        case 'content': switch (payload.data.type) {
            case 'reload-client': return `reload-client ${payload.data.app}`;
            case 'reload-page': return `reload-page ${payload.data.pagename}`;
            case 'enable-source-map': return `source-map enable`;
            case 'disable-source-map': return `source-map disable`;
        }
        case 'auth': switch (payload.data.type) {
            case 'reload-server': return `reload-server ${payload.data.app}`;
            case 'enable-signup': return `enable-signup`;
            case 'disable-signup': return `disable-signup`;
            default: return JSON.stringify(payload.data); // TODO
        }
        case 'service': switch (payload.data) {
            case 'start': return `systemctl start`;
            case 'status': return `systemctl status`;
            case 'stop': return `systemctl stop`;
            case 'restart': return `systemctl restart`;
            case 'is-active': return `systemctl is-active`;
        }
        case 'watchsc': switch (payload.data) {
            case 'start': return 'start watch server-core';
            case 'stop': return 'stop watch server-core';
        }
        default: return JSON.stringify(payload);
    }
    /* eslint-enable no-fallthrough */
}
