import * as chalk from 'chalk';
import * as dayjs from 'dayjs';
import type { AdminPayload, AdminServerCoreCommand } from '../src/shared/types/admin';

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

export function formatAdminServerCoreCommand(command: AdminServerCoreCommand): string {
    switch (command.type) {
        case 'ping': return 'ping';
        case 'shutdown': return 'shutdown';
        case 'content': switch (command.sub.type) {
            case 'reload-client': return `reload-client ${command.sub.app}`;
            case 'reload-page': return `reload-page ${command.sub.pagename}`;
            case 'enable-source-map': return `source-map enable`;
            case 'disable-source-map': return `source-map disable`;
        }
        case 'auth': switch (command.sub.type) {
            case 'reload-server': return `reload-server ${command.sub.app}`;
            case 'enable-signup': return `enable-signup`;
            case 'disable-signup': return `disable-signup`;
            case 'activate-user': return `activate-user ${command.sub.userId}`;
            case 'inactivate-user': return `inactivate-user ${command.sub.userId}`;
            case 'remove-device': return `remove-device ${command.sub.deviceId}`;
        }
    }
}

export function formatAdminPayload(payload: AdminPayload): string {
    switch (payload.target) {
        case 'server-core': return formatAdminServerCoreCommand(payload.data);
        case 'web-page': switch (payload.data) {
            case 'reload-js': return 'web-page reload-js';
            case 'reload-css': return 'web-page reload-css';
        }
        case 'service-host': switch (payload.data) {
            case 'start': return `systemctl start`;
            case 'status': return `systemctl status`;
            case 'stop': return `systemctl stop`;
            case 'restart': return `systemctl restart`;
            case 'is-active': return `systemctl is-active`;
        }
        case 'self-host': switch (payload.data) {
            case 'start': return 'self-host start server-core';
            case 'stop': return 'self-host stop server-core';
        }
        default: return JSON.stringify(payload);
    }
}
