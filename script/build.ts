import { default as runSelf } from './build-self';
import { default as runServerCore } from './build-server-core';

const commandLine = process.argv.slice(2);

if (commandLine.length == 1 && (commandLine[0] == 'self' || commandLine[0] == 'admin')) {
    runSelf(commandLine[0]);
} else if (commandLine.length == 1 && commandLine[0] == 'server-core') {
    runServerCore(false);
} else if (commandLine.length == 2 && commandLine.includes('server-core') && commandLine.includes('--watch')) {
    runServerCore(true);
} else {
    console.log('unknown command line, abort');
}
