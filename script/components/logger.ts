import chalk from 'chalk-template';
import dayjs from 'dayjs';

// TODO check whether this pattern is useful
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
