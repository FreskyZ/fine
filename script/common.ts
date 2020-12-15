import * as fs from 'fs';
import * as chalk from 'chalk';
import * as dayjs from 'dayjs';

export const projectDirectory = '<PROJECTDIR>';
export const nodePackage = JSON.parse(fs.readFileSync('package.json', 'utf-8'));

// this config is read runtime and replace for build normal things
// so build script itself directly use this instead of replace it while building self
export const compileTimeConfig = JSON.parse(fs.readFileSync('maka.config', 'utf-8'));
export const commonReadFileHook = (fileName: string, original: (fileName: string) => string) => {
    let content = original(fileName);
    if (!fileName.endsWith('.d.ts')) {
        for (const configName in compileTimeConfig) {
            content = content.split(configName).join(compileTimeConfig[configName]);
        }
    }
    return content;
}
export const commonWatchReadFileHook = (fileName: string, encoding: string, original: (fileName: string, encoding: string) => string) => {
    let content = original(fileName, encoding);
    if (!fileName.endsWith('.d.ts')) {
        for (const configName in compileTimeConfig) {
            content = content.split(configName).join(compileTimeConfig[configName]);
        }
    }
    return content;
};


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
