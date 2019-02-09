import fs from 'fs';
import path from 'path';
import process from 'process';
import express from 'express';
import moment from 'moment';

type Level = 'info' | 'error';
const levels: Level[] = ['info', 'error'];

type CachePolicy = 'lazy' | 'eager';
const policies = { 'info': 'lazy' as CachePolicy, 'error': 'eager' as CachePolicy };

const timedFlushInterval = 30_000; // 600_000; // 10 minutes

const rootDirectory = process.cwd();
const logsDirectory = path.join(rootDirectory, 'logs');
const formatFileName = (time: moment.Moment, level: Level) => `${time.format('Y-MM-DD')}-${level}.log`;
const formatFilePath = (time: moment.Moment, level: Level) => path.join(logsDirectory, formatFileName(time, level));

interface LogElement { time: string, cat: string, message: string }

function loadPreviousLogsOrInitialize(fileName: string): LogElement[] {

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

interface State { cacheDate: moment.Moment, elements: LogElement[], notFlushedCount: number }
const states = new Map<Level, State>(levels.map((level): [Level, State] => {
    const cacheDate = moment().utc();
    const elements = loadPreviousLogsOrInitialize(formatFilePath(cacheDate, level));
    return [level, { cacheDate, elements, notFlushedCount: 0 } as State];
}));

function flushLevel(level: Level): void {
    const state = states.get(level)!;

    state.notFlushedCount = 0;
    fs.writeFileSync(formatFilePath(state.cacheDate, level), JSON.stringify(state.elements));

    // every level does their switch log file on their own;
    if (!state.cacheDate.isSame(moment().utc(), 'day')) {
        // only update chaceDate is enough, because other fields flushed just now
        state.cacheDate = moment();
    }
}

function write(level: Level, cat: string, message: string): void {
    const state = states.get(level)!;

    state.elements.push({ time: moment().toJSON(), cat, message });

    if (policies[level] == 'lazy') {
        if (state.notFlushedCount == 42) {
            flushLevel(level);
        } else {
            state.notFlushedCount += 1;
        }
    } else {
        flushLevel(level);
    }
}

// this currently only for chain invoking
class Logger {
    constructor() {}
    public info(cat: string, message: string): Logger {
        write('info', cat, message);
        return this;
    }
    public error(cat: string, message: string): Logger {
        write('error', cat, message);
        return this;
    }
}

const flushAll = () => levels.map(level => flushLevel(level));
setInterval(flushAll, timedFlushInterval).unref(); // call flush every 10 minutes, unref to disable block exit
process.on('exit', _code => flushAll());

const logger = new Logger();
export default logger;

// get log file api
export function setupLogFileAPI(app: express.Application): void {
    app.get('/logs/:filename', (request, response) => {
        const fileName = request.params.filename as string;
        const filePath = path.join(logsDirectory, fileName);

        if (fs.existsSync(filePath)) {
            response.sendFile(filePath);
        } else {
            // send empty file
            response.status(200).header('Content-Type', 'text/plain').send('[]');
        }
    });
}

