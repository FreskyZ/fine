import * as fs from 'fs';
import * as chalk from 'chalk';
import * as dayjs from 'dayjs';

export const projectDirectory = '<PROJECTDIR>';
export const nodePackage = JSON.parse(fs.readFileSync('package.json', 'utf-8'));

export function logInfo(header: string, message: string) {
    console.log(chalk`[${dayjs().format('HH:mm:ss')}][{cyan ${header}}] ${message}`);
}
export function logError(header: string, message: string) {
    console.log(chalk`[${dayjs().format('HH:mm:ss')}][{red ${header}}] ${message}`);
}

process.on('unhandledRejection', error => { 
    console.log('unhandled reject: ', error);
    process.exit(0);
});
