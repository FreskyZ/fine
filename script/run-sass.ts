import * as chalk from 'chalk';
import { Options, render as transpileStyle } from 'node-sass';
import { logInfo, logError } from './common';

export type SassOptions = Options;

export async function transpile(options: Options): Promise<string> {
    logInfo('css', chalk`transpile {yellow ${options.file}}`);

    return new Promise((resolve, reject) => {
        transpileStyle(options, (error, result) => {
            if (error) {
                logError('css', `error at ${options.file}:${error.line}:${error.column}: ${error.message}`);
                reject();
            } else {
                logInfo('css', `transpile completed in ${result.stats.duration}ms`);
                resolve(result.css.toString('utf-8'));
            }
        });
    });
}
