import * as fs from 'fs';
import * as path from 'path';
import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';

// logging, usage
//
// import { logInfo, logError } as log from './logger'
// logInfo({ type: 'request', path: '/', by: 'some user' });
// logError({ type: 'request error', message: 'message', stack: [{ location, name }] })

// internal
// normal contents are cached until certain amount of entries added
// eager contents (errors) are flushed immediately

// because initialize require utc, while index do not use dayjs, so put it here
dayjs.extend(utc);

type Level = 'info' | 'error';
const levels: Level[] = ['info', 'error'];

type CachePolicy = 'lazy' | 'eager';
const policies: { [key in Level]: CachePolicy } = { 'info': 'lazy', 'error': 'eager' };

interface Entry {
    t: string, // time, dayjs.toJson ISO8601 format
    c: any,    // content is any to-json-able object
}

const lazyFlushCount = 42;         // arbitray not too small and not big value
const lazyFlushInterval = 600_000; // 10 minutes to flush normal
const cleanupInterval = 3600_000;  // 1 hour to cleanup outdated logs
const logReserveDays = 7;          // reserve log for 1 week

const logsDirectory = path.resolve('logs');
function getLogFileName(date: dayjs.Dayjs, level: Level) {
    return path.join(logsDirectory, `${date.format('YYYY-MM-DD')}-${level}.log`);
}

function loadOrInitializeEntries(fileName: string): Entry[] {
    if (fs.existsSync(fileName)) {
        const content = fs.readFileSync(fileName).toString();
        try {
            return JSON.parse(content);
        } catch {
            // ignore here and reset file content later in this function
        }
    }

    // if file not exists or json parse failure, set log file content to empty
    fs.writeFileSync(fileName, "[]");
    return [];
}

type State = { [key in Level]: {
    date: dayjs.Dayjs,
    filename: string,
    entries: Entry[],
    notFlushedCount: number,
} };
const state = levels.reduce<Partial<State>>((s, level) => {
    const date = dayjs.utc();
    const filename = getLogFileName(date, level);
    const entries = loadOrInitializeEntries(filename);
    s[level] = { date, filename, entries, notFlushedCount: 0 };
    return s;
}, {}) as State;

function flush(level: Level): void {
    const { date, filename, entries } = state[level];

    state[level].notFlushedCount = 0;
    fs.writeFileSync(filename, JSON.stringify(entries));

    // every level does their switch log file on their own;
    if (!date.isSame(dayjs.utc(), 'date')) {
        state[level].date = dayjs.utc();
        state[level].filename = getLogFileName(date, level);
        state[level].entries = loadOrInitializeEntries(state[level].filename);
        // state[level].notFlushedCount = 0; // already cleared
    }
}
function write(level: Level, content: any) {
    const { entries, notFlushedCount } = state[level];

    if (typeof content != 'object') {
        content = { content };
    }

    // simply add time to content, to decrease content deepness
    content.$$t = dayjs.utc().toJSON();
    entries.push(content);

    if (policies[level] == 'lazy') {
        if (notFlushedCount == lazyFlushCount) {
            flush(level);
        } else {
            state[level].notFlushedCount += 1;
        }
    } else {
        flush(level);
    }
}

// a very simple tracing method to use with akari watch core
const TRACE = 'FINE_TRACE' in process.env;
export const logTrace = TRACE ? (...args: any[]) => console.log(...args) : (..._args: any[]) => {};

export function logInfo(content: any): void { write('info', content); logTrace(content); }
export function logError(content: any): void { write('error', content); logTrace(content); }

function flushAll() {
    levels.map(level => flush(level));
}
setInterval(flushAll, lazyFlushInterval).unref(); // use unref unless it will block process exit

function cleanup() {
    for (const filename of fs.readdirSync(logsDirectory)) {
        const date = dayjs.utc(path.basename(filename).slice(0, 10), 'YYYY-MM-DD');
        if (date.isValid() && date.add(logReserveDays, 'day').isBefore(dayjs.utc(), 'date')) {
            try {
                fs.unlinkSync(path.resolve(logsDirectory, filename));
            } catch {
                // ignore
            }
        }
    }
}
setInterval(cleanup, cleanupInterval).unref();

process.on('exit', () => {
    flushAll();
    cleanup();
});
