import * as fs from 'fs';
import * as chalk from 'chalk';
import { Options, render } from 'sass';
import { logInfo, logError } from '../common';

export interface SassOptions {
    entry: string,
    output: string,
}

class SassTranspiler {
    public constructor(public options: SassOptions) {
    }

    // return success instead of reject because try catch every await is redundent
    public transpile = () => new Promise<{ success: boolean }>(resolve => {
        logInfo('css', chalk`once {yellow ${this.options.entry}}`);
    
        render({
            file: this.options.entry,
            outputStyle: 'compressed',
        }, (error, result) => {
            if (error) {
                logError('css', `error at ${error.file}:${error.line}:${error.column}: ${error.message}`);
                resolve({ success: false });
            } else {
                fs.writeFileSync(this.options.output, result.css);
                logInfo('css', `completed in ${result.stats.duration}ms`);
                resolve({ success: true });
            }
        });
    });

    // single entry, watch all included files, any change will invalidate all watchers and restart all watch again
    // callback only called when watch retranspile success
    public watch(callback: () => void) {
        const self = this;
        logInfo('css', chalk`watch {yellow ${this.options.entry}}`);

        const watchers: fs.FSWatcher[] = [];
        const renderOptions: Options = {
            file: this.options.entry, 
            outputStyle: 'compressed',
        };
    
        // prevent reentry: 
        // if running and a new watch event happens, it will find state is running and transfer state to pending
        // then when run complete, it will find state is pending instead of running and trigger another run, or else it will transfer state to none
        let state: 'none' | 'running' | 'pending' = 'none';
        (function impl() {
            state = 'running';
            for (const watcher of watchers) {
                watcher.close();
            }
            watchers.splice(0, watchers.length); // clear inplace

            render(renderOptions, (error, result) => {
                if (error) {
                    logError('css', `error at ${error.file}:${error.line}:${error.column}: ${error.message}`);
                } else {
                    fs.writeFileSync(self.options.output, result.css);
                    logInfo('css', `completed in ${result.stats.duration}ms`);
                    callback();
                }
                
                for (const file of result.stats.includedFiles) {
                    watchers.push(fs.watch(file, { persistent: false }, () => {
                        if (state == 'running') {
                            logInfo('css', 'retranspile waiting');
                            state = 'pending';
                        } else if (state == 'none') {
                            logInfo('css', 'retranspile (1)');
                            impl();
                        } // else if state == pending: already changed to pending
                    }));
                }
                if (state == 'pending') {
                    logInfo('css', 'retranspile (2)');
                    impl();
                } else if (state == 'running') {
                    state = 'none';
                } // else if state == none: unreachable
            });
        })(); // initial render
    }
}

export function sass(options: SassOptions) { return new SassTranspiler(options); }
