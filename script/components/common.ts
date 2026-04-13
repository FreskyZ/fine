import fs from 'node:fs/promises';
import chalk from 'chalk-template';
import dayjs from 'dayjs';
import yaml from 'yaml';

export function logInfo(header: string, message: string, error?: any): void {
    if (error) {
        console.log(chalk`💻[{green ${dayjs().format('HH:mm:ss.SSS')}} {gray ${header}}] ${message}`, error);
    } else {
        console.log(chalk`💻[{green ${dayjs().format('HH:mm:ss.SSS')}} {gray ${header}}] ${message}`);
    }
}
export function logError(header: string, message: string, error?: any): void {
    if (error) {
        console.log(chalk`💻[{green ${dayjs().format('HH:mm:ss.SSS')}} {red ${header}}] ${message}`, error);
    } else {
        console.log(chalk`💻[{green ${dayjs().format('HH:mm:ss.SSS')}} {red ${header}}] ${message}`);
    }
}
export function logCritical(header: string, message: string): never {
    console.log(chalk`[{green ${dayjs().format('HH:mm:ss.SSS')}} {red ${header}}] ${message}`);
    return process.exit(1);
}

export interface ScriptConfig {
    domain: string,
}
export const scriptconfig: ScriptConfig = yaml.parse(await fs.readFile('/etc/fine/akari.yml', 'utf-8'));
