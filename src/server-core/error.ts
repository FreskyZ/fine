import * as fs from 'fs';
import * as koa from 'koa';
import { SourceMapConsumer } from 'source-map';
import { logError } from './logger';
import { MyError, MyErrorType } from '../shared/error';

// contains request and process unexpected error handlers

interface StackFrame {
    raw?: string,
    name?: string,
    async?: boolean,
    asName?: string,
    file?: string,
    line?: number,
    column?: number,
    originalFile?: string,
    originalLine?: number,
    originalColumn?: number,
}

// key is full path in stack
const sourcemaps: { [jsFileName: string]: SourceMapConsumer } = {};
// return resolve(null) for 1. not my js file, 2. js.map not exist, 3. failed to load source map
async function tryGetSourceMap(jsFileName: string): Promise<SourceMapConsumer> {
    if (!jsFileName.startsWith("WEBROOT")) {
        return null;
    }
    const mapFileName = jsFileName + '.map';
    if (!fs.existsSync(mapFileName)) {
        return null;
    }

    if (!(jsFileName in sourcemaps)) {
        try {
            sourcemaps[jsFileName] = await new SourceMapConsumer(JSON.parse(fs.readFileSync(mapFileName, 'utf-8')));
        } catch {
            sourcemaps[jsFileName] = null; // insert null or else next times it will continue try loading
        }
    }

    return sourcemaps[jsFileName];
}

function printStackFrame(frames: StackFrame[]) {
    for (const frame of frames) {
        if (frame.raw) {
            console.log('  at ' + frame.raw);
            continue;
        }
        
        let result = '  at';
        if (frame.name) {
            result += ` ${frame.async ? 'async ' : ''}${frame.name}`;
            if (frame.asName) {
                result += ` [as ${frame.asName}]`;
            }
        }

        if (frame.originalFile != null && frame.originalLine != null && frame.originalColumn != null) {
            result += ` (${frame.originalFile}:${frame.originalLine}:${frame.originalColumn})`;

            if (frame.file != null && frame.line != null && frame.column != null) {
                result += ` (${frame.file}:${frame.line}:${frame.column})`;
            }
        } else if (frame.file != null && frame.line != null && frame.column != null) {
            result += ` (${frame.file}:${frame.line}:${frame.column})`;
        }

        console.log(result);
    }
}

const stackFrameRegex1 = /^(?<file>.+):(?<line>\d+):(?<column>\d+)$/;
const stackFrameRegex2 = /^(?<async>async )?(?<name>[\w.]+)( \[as (?<asName>.+)\])? \((?<file>.+):(?<line>\d+):(?<column>\d+)\)$/;
async function parseStack(raw: string): Promise<StackFrame[]> {
    // example
    // Error: some message
    //   at async function3 (/path/to/file3.js:20:30)
    //   at function_name (/path/to/file.js:10:20)
    //   at function2 [as function3] (path/to/file2.js:10:20)
    //   at path/to/file3.js:10:20

    const frames: StackFrame[] = [];
    for (let rawFrame of raw.split('\n').slice(1)) { // slice to remove first row
        rawFrame = rawFrame.trim().slice(3); // remove heading '  at '

        const match1 = stackFrameRegex1.exec(rawFrame);
        if (match1) {
            const file = match1.groups['file'];
            const [line, column] = [parseInt(match1.groups['line']), parseInt(match1.groups['column'])];

            const sourcemap = await tryGetSourceMap(file);
            if (!sourcemap) {
                frames.push({ file, line, column });
            } else {
                const position = sourcemap.originalPositionFor({ line, column });
                frames.push({ file, line, column, originalFile: position.source, originalLine: position.line, originalColumn: position.column })
            }
            continue;
        }

        const match2 = stackFrameRegex2.exec(rawFrame);
        if (match2) {
            const [name, async, asName] = [match2.groups['name'], !!match2.groups['async'], match2.groups['asName']];
            const file = match2.groups['file'];
            const [line, column] = [parseInt(match2.groups['line']), parseInt(match2.groups['column'])];

            const sourcemap = await tryGetSourceMap(file);
            if (!sourcemap) {
                frames.push({ name, async, asName, file, line, column });
            } else {
                const position = sourcemap.originalPositionFor({ line, column });
                frames.push({ name, async, asName, file, line, column, originalFile: position.source, originalLine: position.line, originalColumn: position.column })
            }
            continue;
        }

        frames.push({ raw: rawFrame });
    }
    return frames;
}

// catch all request exceptions and continue
const ErrorCodes: { [errorType in MyErrorType]: number } = { 'common': 400, 'auth': 401, 'not-found': 404, 'method-not-allowed': 405, 'unreachable': 500 };
export async function handleRequestError(ctx: koa.Context, next: koa.Next) {
    try {
        await next();
    } catch (error) {
        const summary =  `${ctx.method} ${ctx.host}${ctx.url}`;

        if (error instanceof MyError) {
            const message = error.type == 'unreachable' ? 'unreachable code reached' 
                : error.type == 'method-not-allowed' ? 'method not allowed' : error.message;
            ctx.status = ErrorCodes[error.type];
            ctx.body = { message };
            logError({ type: error.type, request: summary, error: message });
        } else {
            ctx.status = 500;
            const errorMessage = error instanceof Error ? error.message : Symbol.toStringTag in error ? error.toString() : 'error';
            if ('stack' in error) {
                const stack = await parseStack(error.stack);
                logError({ type: 'request handler error', request: summary, error: errorMessage, stack });
                console.log(`${summary}: ${errorMessage}: `);
                printStackFrame(stack);
            } else {
                logError({ type: 'request handler error', request: summary, error: errorMessage });
                console.log(`${summary}: ${errorMessage}`);
            }
        }
    }
}

// log and abort for all uncaught exceptions
export async function handleProcessException(error: Error) {
    if (error.message == 'read ECONNRESET') {
        // ignore read connection reset beceause it does not corrupt state while it seems to be not catchable by many on('error')s
        logError({ type: 'uncaught read connection reset', error });
        return;
    } else if (error.message.includes('deps/openssl/openssl')) {
        // ignore openssl error because I guess it does not corrupt state while it seems to be not catchable by many on('error')s
        logError({ type: 'openssl error, I guess', error });
        return;
    }

    try {
        if (error.stack) {
            const stack = await parseStack(error.stack);
            logError({ type: 'uncaught exception', error: error.message, stack });
            console.log(`uncaught exception: ${error.message}: `);
            printStackFrame(stack);
        } else {
            logError({ type: 'uncaught exception', error: error.message });
            console.log(`uncaught exception: ${error.message}`);
        }
    } catch {
        console.log(error);
    } finally {
        process.exit(103);
    }
}

// log and abort for all unhandled rejections
export async function handleProcessRejection(reason: any) {
    try {
        const message = reason instanceof Error ? reason.message : Symbol.toStringTag in reason ? reason.toString() : 'error';
        if ('stack' in reason) {
            const stack = await parseStack(reason.stack);
            logError({ type: 'unhandled rejection', message, stack });
            console.log(`unhandled rejection: ${message}: `);
            printStackFrame(stack);
        } else {
            logError({ type: 'unhandled rejection', message });
            console.log(`unhandled rejection: ${message}: `);
        }
    } catch {
        console.log(reason);
    } finally {
        process.exit(104);
    }
}
