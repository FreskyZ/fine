import fs from 'node:fs/promises';
import chalk from 'chalk-template';
import dayjs from 'dayjs';

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

// there was a dedicated config for local akari, mainly for ssh related configs,
// but sftp deploy does not work with containerized environment, so it is discarded
// and directly use local-mapped config (see upload core config and download core config commands)
// still named scriptconfig to avoid conflict with codegenconfig, etc.
export interface ScriptConfig {
    domain: string,
}
export const scriptconfig: ScriptConfig = await (async () => {
    const config = JSON.parse(await fs.readFile('/etc/fine/config.json', 'utf-8'));
    return { domain: Object.keys(config.certificates)[0] };
})();
