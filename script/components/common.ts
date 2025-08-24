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

// build script's config (akari.json), or config for code in 'script' folder,
// to be distinguished with codegen config (api.xml and database.xml) and core config (/webroot/config)
export interface ScriptConfig {
    domain: string,
    webroot: string,
    certificate: string,
    ssh: { user: string, identity: string, passphrase: string },
}
export const scriptconfig: ScriptConfig = JSON.parse(await fs.readFile('/etc/akari.json', 'utf-8'));
