import * as fs from 'fs';
import { default as runSelf } from './build-self';
import { default as runServerCore } from './build-server-core';

export const projectDirectory = '<PROJECTDIR>';
export const nodePackage = JSON.parse(fs.readFileSync('package.json', 'utf-8'));

const commandLine = process.argv.slice(2);

if (commandLine.length == 1 && commandLine.includes('self')) {
    runSelf();
} else if (commandLine.length <= 2 && commandLine.includes('server-core')) { // .includes implifies length > 0
    runServerCore(false);
} else {
    console.log('unknown command line, abort');
}
