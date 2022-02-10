import * as fs from 'fs';
import * as chalk from 'chalk';
import { Exception, compile } from 'sass';
import { render, LegacyOptions } from 'sass';
import { logInfo, logError } from '../common';

export interface SassOptions {
    entry: string,
}
export interface SassResult {
    success: true,
    resultCss: Buffer,
}

class SassTranspiler {
    public constructor(public readonly options: SassOptions, private readonly additionalHeader?: string) {
        this.additionalHeader = this.additionalHeader ?? '';
    }

    // return success instead of reject because try catch every await is redundent
    public transpile = () => new Promise<{ success: false } | SassResult>(resolve => {
        logInfo('css', chalk`once {yellow ${this.options.entry}}`);

        try {
            const result = compile(this.options.entry, {
                alertAscii: true,
                style: 'compressed',
            });
            logInfo('css', `completed in ?ms`);
            resolve({ success: true, resultCss: Buffer.from(result.css, 'utf-8') });
        } catch (error) {
            if (error instanceof Exception) {
                logError('css', `error at ${error.span.url}:${error.span.start.line}:${error.span.start.column}: ${error.message}`);
            } else {
                logError('css', `error ${error}`);
            }
            resolve({ success: false });
        }
    });

    // single entry, watch all included files, any change will invalidate all watchers and restart all watch again
    // callback only called when watch retranspile success
    public watch(callback: (result: SassResult) => void) {
        const logHeader = `css${this.additionalHeader}`;
        logInfo(logHeader, chalk`watch {yellow ${this.options.entry}}`);

        const watchers: fs.FSWatcher[] = [];
        const renderOptions: LegacyOptions<'async'> = {
            file: this.options.entry,
            outputStyle: 'compressed',
        };

        // prevent reentry:
        // if running and a new watch event happens, it will find state is running and transfer state to pending
        // then when run complete, it will find state is pending instead of running and trigger another run, or else it will transfer state to none
        let state: 'none' | 'running' | 'pending' = 'none';
        // use previous file list if error happens
        let previousFiles: string[] = [this.options.entry];
        (function impl() {
            state = 'running';
            for (const watcher of watchers) {
                watcher.close();
            }
            watchers.splice(0, watchers.length); // clear inplace

            render(renderOptions, (error, result) => {
                if (error) {
                    logError(logHeader, `error at ${error.file}:${error.line}:${error.column}: ${error.message}`);
                } else {
                    logInfo(logHeader, `completed in ${result.stats.duration}ms`);
                    callback({ success: true, resultCss: result.css });
                    // I cannot find result stat in new api, use legacy for now // may be that's why all legacy is preserved
                    previousFiles = result.stats.includedFiles;
                }

                for (const file of previousFiles) {
                    watchers.push(fs.watch(file, { persistent: false }, () => {
                        if (state == 'running') {
                            logInfo(logHeader, 'retranspile waiting');
                            state = 'pending';
                        } else if (state == 'none') {
                            logInfo(logHeader, 'retranspile (1)');
                            impl();
                        } // else if state == pending: already changed to pending
                    }));
                }
                if (state == 'pending') {
                    logInfo(logHeader, 'retranspile (2)');
                    impl();
                } else if (state == 'running') {
                    state = 'none';
                } // else if state == none: unreachable
            });
        })(); // initial render
    }
}

export function sass(options: SassOptions, additionalHeader?: string): SassTranspiler { return new SassTranspiler(options, additionalHeader); }
