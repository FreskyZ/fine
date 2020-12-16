import * as ts from 'typescript';
import * as chalk from 'chalk';
import { logError, logInfo } from './common';

export const ModuleKind = ts.ModuleKind;
export const ModuleResolutionKind = ts.ModuleResolutionKind;
export const JsxEmit = ts.JsxEmit;
export const ScriptTarget = ts.ScriptTarget;
export type TypeScriptCompilerOptions = ts.CompilerOptions & {
    readFileHook?: (fileName: string, originalReadFile: (filename: string) => string) => string,
    writeFileHook?: (fileName: string, data: string, writeByteOrderMark: boolean, onError: (message: string) => void, sourceFiles: readonly ts.SourceFile[], originalWriteFile: ts.WriteFileCallback) => void,
    watchReadFileHook?: (path: string, encoding: string, originalReadFile: (path: string, encoding?: string) => string) => string,
    watchWriteFileHook?: (path: string, data: string, writeBOM: boolean, originalWriteFile: (path: string, data: string, writeBOM?: boolean) => void) => void,
    watchEmit?: () => void | Promise<void>, // after emit completed successfully
};

const basicOptions: ts.CompilerOptions = {
    lib: ['lib.es2020.d.ts'],
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    noEmitOnError: true,
    noImplicitAny: true,
    noFallthroughCaseInSwitch: true,
    noImplicitReturns: true,
    noImplicitThis: true,
    noUnusedLocals: true,
    noUnusedParameters: true,
    // strict: true,
    strictFunctionTypes: true,
    strictBindCallApply: true,
    // strictNullChecks: true,
    // strictPropertyInitialization: true,
    removeComments: true,
};

const diagnosticCategoryColors = {
    [ts.DiagnosticCategory.Warning]: chalk.red,
    [ts.DiagnosticCategory.Error]: chalk.red,
    [ts.DiagnosticCategory.Suggestion]: chalk.green,
    [ts.DiagnosticCategory.Message]: chalk.cyan,
};

function summaryDiagnostics(diagnostics: ReadonlyArray<ts.Diagnostic>): { success: boolean, message: string } {
    const errorCount = diagnostics.filter(d => d.category == ts.DiagnosticCategory.Error || ts.DiagnosticCategory.Warning).length;
    const normalCount = diagnostics.length - errorCount;

    let message: string;
    if (normalCount == 0 && errorCount == 0) {
        message = 'no diagnostic';
    } else if (normalCount != 0 && errorCount == 0) {
        message = chalk`{yellow ${normalCount}} infos`;
    } else if (normalCount == 0 /* && errorCount != 0 */) {
        message = chalk`{yellow ${errorCount}} errors`;
    } else /* normalCount != 0 && errorCount != 0 */ {
        message = chalk`{yellow ${errorCount}} errors and {yellow ${normalCount}} infos`;
    }

    return { success: errorCount == 0, message };
}
function printDiagnostic({ category, code, messageText, file, start }: ts.Diagnostic): void {
    if (code == 6031) {
        // original message is 'TS6031: Starting compilation in watch mode...'
        // ignore because transpileWatch have its own starting message
        return; 
    } else if (code == 6032) {
        // original message is 'TS6032: File change detected. Starting incremental compilation
        logInfo('tsc', 'retranspile');
    } else if (code == 6194) {
        // originaL message is 'TS6194: Found 0 errors. Watching for file changes'
        // because this is already checked by emit hook's !emitResult.emitSkipped, and this actually fires after that, which will make output message not in order, so ignore
        return;
    } else {
        const displayCode = diagnosticCategoryColors[category](`  TS${code} `);

        let fileAndPosition = '';
        if (file) {
            const { line, character: column } = ts.getLineAndCharacterOfPosition(file, start);
            fileAndPosition = chalk`{yellow ${file.fileName}:${line + 1}:${column + 1}} `;
        }
    
        let flattenedMessage = ts.flattenDiagnosticMessageText(messageText, '\n');
        if (flattenedMessage.includes('\n')) {
            flattenedMessage = '\n' + flattenedMessage;
        }
        console.log(displayCode + fileAndPosition + flattenedMessage);
    }
}

function createCompilerHost(options: TypeScriptCompilerOptions) {
    const host = ts.createCompilerHost(options);

    if (options.readFileHook) {
        const originalReadFile = host.readFile;
        host.readFile = fileName => options.readFileHook(fileName, originalReadFile);
    }

    // optimize output content
    const originalWriteFile = host.writeFile;
    host.writeFile = (fileName, content, writeBOM, onError, sourceFiles) => {
        if (fileName.endsWith('.js')) {
            // remove not used "use strict"
            if (content.startsWith('"use strict"')) {
                content = content.slice(content.indexOf('\n') + 1);
            }
            // remove not used exports.__esModule = true
            if (content.startsWith('Object.define')) {
                content = content.slice(content.indexOf('\n') + 1);
            }
            // remove not used initialize exports.xxx as void 0
            if (content.startsWith('exports.')) { 
                content = content.slice(content.indexOf('\n') + 1);
            }
            // remove not used sourceMapURL
            if (options.sourceMap) {
                content = content.slice(0, content.lastIndexOf('\n') + 1); // make sure LF before EOF
            } else if (!content.endsWith('\n')) {
                content = content + '\n'; // make sure LF before EOF
            }
        }

        if (options.writeFileHook) {
            options.writeFileHook(fileName, content, writeBOM, onError, sourceFiles, originalWriteFile);
        } else {
            originalWriteFile(fileName, content, writeBOM, onError, sourceFiles);
        }
    }
    return host;
}

// although not needed, make this async to look like run-webpack and run-source-map
export function transpileOnce(entry: string | string[], additionalOptions: TypeScriptCompilerOptions) {
    // tsc: typescript compiler
    logInfo('tsc', chalk`once {yellow ${entry}}`);

    const options = { 
        ...basicOptions, 
        ...additionalOptions, 
        lib: 'lib' in additionalOptions ? [...basicOptions.lib, ...additionalOptions.lib] : basicOptions.lib,
    } as unknown as ts.CompilerOptions; // typescript says writeFileHook and readFileHook is not compatible with the definition because the index property, ignore it

    const host = createCompilerHost(options);
    const program = ts.createProgram(Array.isArray(entry) ? entry : [entry], options, host);
    const { diagnostics } = program.emit();
    const { success, message: summary } = summaryDiagnostics(diagnostics);
    if (success) {
        logInfo('tsc', `completed with ${summary}`);
    } else {
        logError('tsc', `completed with ${summary}`);
    }

    diagnostics.map(printDiagnostic);    
    return success;
}

export function transpileWatch(entry: string, additionalOptions: TypeScriptCompilerOptions) {
    logInfo('tsc', chalk`watch {yellow ${entry}}`);

    if (additionalOptions.watchReadFileHook) {
        const originalReadFile = ts.sys.readFile;
        ts.sys.readFile = (path, encoding) => additionalOptions.watchReadFileHook(path, encoding, originalReadFile);
    }

    const originalWriteFile = ts.sys.writeFile;
    ts.sys.writeFile = (fileName, content, writeBOM) => {
        if (fileName.endsWith('.js')) {
            // remove not used "use strict"
            if (content.startsWith('"use strict"')) {
                content = content.slice(content.indexOf('\n') + 1);
            }
            // remove not used exports.__esModule = true
            if (content.startsWith('Object.define')) {
                content = content.slice(content.indexOf('\n') + 1);
            }
            // remove not used initialize exports.xxx as void 0
            if (content.startsWith('exports.')) { 
                content = content.slice(content.indexOf('\n') + 1);
            }
            // remove not used sourceMapURL
            if (additionalOptions.sourceMap) {
                content = content.slice(0, content.lastIndexOf('\n') + 1); // make sure LF before EOF
            } else if (!content.endsWith('\n')) {
                content = content + '\n'; // make sure LF before EOF
            }
        }

        if (additionalOptions.watchWriteFileHook) {
            additionalOptions.watchWriteFileHook(fileName, content, writeBOM, originalWriteFile);
        } else {
            originalWriteFile(fileName, content, writeBOM);
        }
    }

    ts.createWatchProgram(ts.createWatchCompilerHost<ts.EmitAndSemanticDiagnosticsBuilderProgram>(
        [entry],
        { ...basicOptions, ...additionalOptions }, 
        ts.sys,
        (...createProgramArgs) => {
            const program = ts.createEmitAndSemanticDiagnosticsBuilderProgram(...createProgramArgs);
            if (additionalOptions.watchEmit) {
                const originalEmit = program.emit;
                program.emit = (...emitArgs) => {
                    const emitResult = originalEmit(...emitArgs);
                    if (!emitResult.emitSkipped) {
                        additionalOptions.watchEmit();
                    }
                    return emitResult;
                }
            }
            return program;
        },
        printDiagnostic,
        printDiagnostic,
    ));
}
