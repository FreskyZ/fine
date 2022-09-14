import * as chalk from 'chalk';
import * as dayjs from 'dayjs';
import type { AdminCommand, AdminCoreCommand } from '../src/shared/types/admin';

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

export function formatAdminCoreCommand(command: AdminCoreCommand): string {
    switch (command.type) {
        case 'ping': return 'ping';
        case 'shutdown': return 'shutdown';
        case 'content': switch (command.sub.type) {
            case 'reload-static': return `reload-static ${command.sub.key}`;
            case 'reload-config': return `reload-config`;
            case 'enable-source-map': return `source-map enable`;
            case 'disable-source-map': return `source-map disable`;
            default: return `unknown content command ${command}`;
        }
        case 'auth': switch (command.sub.type) {
            case 'reload-server': return `reload-server ${command.sub.app}`;
            case 'enable-signup': return `enable-signup`;
            case 'disable-signup': return `disable-signup`;
            case 'activate-user': return `activate-user ${command.sub.userId}`;
            case 'inactivate-user': return `inactivate-user ${command.sub.userId}`;
            case 'remove-device': return `remove-device ${command.sub.deviceId}`;
            default: return `unknown auth command ${command}`;
        }
        default: return `unknown core command ${JSON.stringify(command)}`;
    }
}

export function formatAdminPayload(command: AdminCommand): string {
    switch (command.target) {
        case 'core': return formatAdminCoreCommand(command.data);
        case 'dev-page': switch (command.data) {
            case 'reload-js': return 'dev-page reload-js';
            case 'reload-css': return 'dev-page reload-css';
            default: return `unknown dev-page command ${command}`;
        }
        case 'service': switch (command.data) {
            case 'start': return `systemctl start`;
            case 'status': return `systemctl status`;
            case 'stop': return `systemctl stop`;
            case 'restart': return `systemctl restart`;
            case 'is-active': return `systemctl is-active`;
            default: return `unknown service payload ${command}`;
        }
        case 'self-host': switch (command.data) {
            case 'start': return 'self-host start core';
            case 'stop': return 'self-host stop core';
            default: return `unknown self-host command ${command}`;
        }
        default: return `unknown command ${JSON.stringify(command)}`;
    }
}
