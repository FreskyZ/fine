import syncfs from 'node:fs';
import path from 'node:path';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js'; // why does this need .js?

// logging, usage:
//    import { log } from './logger';
//    log.info("some message");
//    log.info({ type: 'some information', data });
//    log.error(some error);
//    log.error({ type: 'request error', error });
//    log.debug(event); // debug log is only enabled by environment variable

// because initialize require utc, while index do not use dayjs, so put it here
dayjs.extend(utc);
// logs are in logs directory, there is no meaning to configure it
const logsDirectory = path.resolve('logs');

interface LoggerOptions {
    readonly postfix: string, // file name postfix
    readonly flushByCount: number,
    readonly flushByInterval: number, // in second, flush when this logger is idle and has something to flush
    readonly reserveDays: number,
}

class Logger {
    private time: dayjs.Dayjs = dayjs.utc();
    private handle: number = 0;
    private notFlushCount: number = 0;
    // not null only when have not flush count
    private notFlushTimeout: NodeJS.Timeout = null;

    constructor(private readonly options: LoggerOptions) {}

    init() {
        syncfs.mkdirSync('logs', { recursive: true });
        this.handle = syncfs.openSync(path.join(logsDirectory,
            `${this.time.format('YYMMDD')}${this.options.postfix}.log`), 'a');
    }

    deinit() {
        if (this.handle) {
            syncfs.fsyncSync(this.handle);
            if (this.notFlushTimeout) {
                clearTimeout(this.notFlushTimeout);
            }
            syncfs.closeSync(this.handle);
        }
    }

    flush() {
        // no if this.handle: according to flush strategy,
        // this function will not be called with this.handle == 0

        this.notFlushCount = 0;
        syncfs.fsyncSync(this.handle);

        if (this.notFlushTimeout) {
            // clear timeout incase this flush is triggered by write
            // does not setup new timeout because now not flush count is 0
            clearTimeout(this.notFlushTimeout);
            this.notFlushTimeout = null;
        }
        if (!this.time.isSame(dayjs.utc(), 'date')) {
            this.time = dayjs.utc();
            syncfs.closeSync(this.handle);
            this.init(); // do not repeat init file handle
            this.notFlushCount = null;
        }
    }

    cleanup() {
        for (const filename of syncfs.readdirSync(logsDirectory)) {
            const date = dayjs.utc(path.basename(filename).slice(0, 8), 'YYMMDD');
            if (date.isValid() && date.add(this.options.reserveDays, 'day').isBefore(dayjs.utc(), 'date')) {
                try {
                    syncfs.unlinkSync(path.resolve(logsDirectory, filename));
                } catch {
                    // ignore
                }
            }
        }
    }

    write(c: string | object) {
        if (!this.handle) {
            this.init();
        }
        const content = typeof c == 'string' ? c : JSON.stringify(c);
        syncfs.writeSync(this.handle, `${dayjs.utc().format('HH:mm:ss')} ${content}\n`);
        if (this.notFlushCount + 1 > this.options.flushByCount) {
            this.flush();
        } else {
            this.notFlushCount += 1;
            if (this.notFlushCount == 1) {
                this.notFlushTimeout = setTimeout(() => this.flush(), this.options.flushByInterval * 1000);
            }
        }
    }
}

type Level = 'info' | 'error' | 'debug';
const levels: Record<Level, LoggerOptions> = {
    // normal log
    info: { postfix: 'I', flushByCount: 11, flushByInterval: 600, reserveDays: 14 },
    // error log, flush immediately, in that case, flush by interval is not used
    error: { postfix: 'E', flushByCount: 0, flushByInterval: 0, reserveDays: 14 },
    // debug log, raw message and transformed message, is written frequently, so flush by count is kind of large
    debug: { postfix: 'D', flushByCount: 101, flushByInterval: 600, reserveDays: 14 },
};

// @ts-ignore ts does not understand object.entries, actually it does not understand reduce<>(..., {}), too
const loggers: Record<Level, Logger>
    = Object.fromEntries(Object.entries(levels).map(([level, options]) => [level, new Logger(options)]));

// @ts-ignore again
export const log: Record<Level, (content: string | object) => void> = Object.fromEntries(Object.entries(loggers)
    .map(([level, logger]) => [level, level == 'debug' && !('FINE_DEBUG' in process.env) ? () => {} : logger.write.bind(logger)]));

// try cleanup outdated logs per hour
setInterval(() => Object.entries(loggers).map(([_, logger]) => logger.cleanup()), 3600_000).unref();

// flush logger on exit is more proper (compare to recent versions of wacq)
process.on('exit', () => {
    Object.entries(loggers).map(([_, logger]) => logger.deinit());
});
// log and abort for all uncaught exceptions and unhandled rejections
process.on('uncaughtException', async error => {
    console.log('uncaught exception', error);
    try {
        log.error(`uncaught exception: ${error.message}`);
    } catch {
        // nothing, this happens when logger initialize have error
    }
    process.exit(103);
});
process.on('unhandledRejection', async reason => {
    console.log('unhandled rejection', reason);
    try {
        log.error(`unhandled rejection: ${reason}`);
    } catch {
        // nothing, this happens when logger initialize have error
    }
    process.exit(104);
});
