import * as chalk from 'chalk';
import { Options, render as transpileStyle } from 'node-sass';
import { logInfo, logError } from '../common';

export type SassOptions = Options;
export type SassResult = {
    success: boolean,
    style?: string,
}

export async function transpile(options: Options): Promise<SassResult> {
    logInfo('css', chalk`{yellow ${options.file}}`);

    return new Promise(resolve => {
        transpileStyle(options, (error, result) => {
            if (error) {
                logError('css', `error at ${options.file}:${error.line}:${error.column}: ${error.message}`);
                resolve({ success: false });
            } else {
                logInfo('css', `completed in ${result.stats.duration}ms`);
                resolve({ success: true, style: result.css.toString('utf-8') });
            }
        });
    });
}
