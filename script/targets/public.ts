import * as fs from 'fs-extra';
import * as rimraf from 'rimraf';
import { logInfo, logError } from '../common';

export function build() {
    logInfo('mka', 'copy public');
    fs.copySync('src/public', 'dist/public', { overwrite: true });
    logInfo('mka', 'copy public completed');
}

export function cleanAll() {
    logInfo('mka', 'clean all');
    rimraf('dist', (error) => {
        if (error) {
            logError('mka', 'clean failed: ' + error.message);
        } else {
            logInfo('mka', 'clean all completed');
        }
    });
}
