import * as fs from 'fs';
import * as koa from 'koa';
import { SourceMapConsumer } from 'source-map';
import { config } from './config';
import { logError } from './logger';

// this module contains request and process unexpected error handlers

interface StackFrame {
    raw?: string,
    name?: string,
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
    if (!jsFileName.startsWith(config.root)) {
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
            result += ` ${frame.name}`;
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
const stackFrameRegex2 = /^(?<name>[\w.]+)( \[as (?<asName>.+)\])? \((?<file>.+):(?<line>\d+):(?<column>\d+)\)$/;
async function parseStack(raw: string): Promise<StackFrame[]> {
    // example
    // Error: some message
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
            const [name, asName] = [match2.groups['name'], match2.groups['asName']];
            const file = match2.groups['file'];
            const [line, column] = [parseInt(match2.groups['line']), parseInt(match2.groups['column'])];

            const sourcemap = await tryGetSourceMap(file);
            if (!sourcemap) {
                frames.push({ name, asName, file, line, column });
            } else {
                const position = sourcemap.originalPositionFor({ line, column });
                frames.push({ name, asName, file, line, column, originalFile: position.source, originalLine: position.line, originalColumn: position.column })
            }
            continue;
        }

        frames.push({ raw: rawFrame });
    }
    return frames;
}

// catch all request exceptions and continue
export async function handleRequestError(ctx: koa.Context, next: koa.Next) {
    try {
        await next();
    } catch (error) {
        ctx.status = 500;
        const summary =  `${ctx.method} ${ctx.host}${ctx.url}`;
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

// log and abort for all uncaught exceptions
export async function handleProcessException(error: Error) {
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
        process.exit(101);
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
        process.exit(102);
    }
}
