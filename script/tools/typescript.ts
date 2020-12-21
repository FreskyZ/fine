import * as ts from 'typescript';
import * as chalk from 'chalk';
import { logError, logInfo, compileTimeConfig } from '../common';

export interface TypeScriptOptions {
    entry: string,
    watch?: boolean, // default to false
    sourceMap?: boolean, // default ot false
    additionalLib?: string[],
    jsx?: boolean, // react-jsx
    importDefault?: boolean, // esModuleInterop
}
export interface TypeScriptHooks {
    readFile?: (fileName: string, originalReadFile: (fileName: string) => string) => string,
    afterEmit: (result: TypeScriptResult) => any,
}
export interface TypeScriptResult {
    success?: boolean, // not used when watch, because watch retranspile error will not call callback
    files: { name: string, content: string }[],
}

const basicOptions: ts.CompilerOptions = {
    lib: ['lib.es2020.d.ts'],
    outDir: '/vbuild', // always write to memory, so give a virtual path is ok
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    skipLibCheck: true,
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

function mergeOptions(options: TypeScriptOptions): ts.CompilerOptions {
    return {
        ...basicOptions,
        sourceMap: options.sourceMap,
        esModuleInterop: options.importDefault,
        jsx: 'jsx' in options ? ts.JsxEmit.ReactJSX : undefined,
        lib: 'additionalLib' in options ? [...basicOptions.lib, ...options.additionalLib.map(b => `lib.${b}.d.ts`)] : basicOptions.lib,
    };
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
        const displayColor = {
            [ts.DiagnosticCategory.Warning]: chalk.red,
            [ts.DiagnosticCategory.Error]: chalk.red,
            [ts.DiagnosticCategory.Suggestion]: chalk.green,
            [ts.DiagnosticCategory.Message]: chalk.cyan,
        }[category];
        const displayCode = displayColor(`  TS${code} `);

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

function printEmitResult(emitResult: ts.EmitResult): boolean {
    const errorCount = emitResult.diagnostics.filter(d => d.category == ts.DiagnosticCategory.Error || ts.DiagnosticCategory.Warning).length;
    const normalCount = emitResult.diagnostics.length - errorCount;

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

    (emitResult.emitSkipped ? logError : logInfo)('tsc', `completed with ${message}`);
    for (const diagnostic of emitResult.diagnostics) {
        printDiagnostic(diagnostic);
    }

    return !emitResult.emitSkipped;
}

// install on ts.sys, already replace by maka.config, call additional hook if exists
function setupReadFileHook(hooks: TypeScriptHooks) {
    const originalReadFile = ts.sys.readFile;
    ts.sys.readFile = (fileName, encoding) => {
        let fileContent: string;
        if (hooks.readFile) {
            fileContent = hooks.readFile(fileName, fileName => originalReadFile(fileName, encoding));
        } else {
            fileContent = originalReadFile(fileName, encoding);
        }

        if (!fileName.endsWith('.d.ts')) { // ignore .d.ts
            for (const configName in compileTimeConfig) {
                fileContent = fileContent.split(configName).join(compileTimeConfig[configName]);
            }
        }
        return fileContent;
    };
}

// use ts.Program.emit second parameter
function createWriteFileHook(files: TypeScriptResult['files']): ts.WriteFileCallback {
    return (fileName, fileContent) => {
        // ignore .js.map
        if (fileName.endsWith('.js')) {
            // remove not used `"use strict";`
            if (fileContent.startsWith('"use strict"')) {
                fileContent = fileContent.slice(fileContent.indexOf('\n') + 1);
            }
            // remove not used `Object.definePropert(exports, '__esModule', true);`
            if (fileContent.startsWith('Object.defineProperty')) {
                fileContent = fileContent.slice(fileContent.indexOf('\n') + 1);
            }
            // remove not used initialize `exports.x = exports.y = void 0;`
            if (fileContent.startsWith('exports.')) { 
                fileContent = fileContent.slice(fileContent.indexOf('\n') + 1);
            }

            const match = /\/\/#\s*sourceMappingURL/.exec(fileContent);
            if (match) {
                fileContent = fileContent.slice(0, match.index); // this exactly make the LF before source mapping URL the LF before EOF
            } else if (!fileContent.endsWith('\n')) {
                fileContent += '\n'; // make sure LF before EOF
            }
        }

        // the `files` is closured when watch, so always check existance and splice
        const existIndex = files.findIndex(f => f.name == fileName);
        if (existIndex >= 0) {
            files.splice(existIndex, 1, { name: fileName, content: fileContent });
        } else {
            files.push({ name: fileName, content: fileContent });
        }
    };
}

function transpileOnce(options: TypeScriptOptions, hooks: TypeScriptHooks) {
    logInfo('tsc', chalk`once {yellow ${options.entry}}`);

    setupReadFileHook(hooks);
    const mergedOptions = mergeOptions(options);
    const program = ts.createProgram([options.entry], mergedOptions, ts.createCompilerHost(mergedOptions));

    const files: TypeScriptResult['files'] = [];
    const emitResult = program.emit(undefined, createWriteFileHook(files));

    const success = printEmitResult(emitResult);
    hooks.afterEmit({ success, files });
}

function transpileWatch(options: TypeScriptOptions, hooks: TypeScriptHooks) {
    logInfo('tsc', chalk`watch {yellow ${options.entry}}`);

    setupReadFileHook(hooks);
    const files: TypeScriptResult['files'] = [];
    ts.createWatchProgram(ts.createWatchCompilerHost<ts.EmitAndSemanticDiagnosticsBuilderProgram>(
        [options.entry], 
        mergeOptions(options),
        ts.sys,
        (...createProgramArgs) => {
            const program = ts.createEmitAndSemanticDiagnosticsBuilderProgram(...createProgramArgs);
            const originalEmit = program.emit;
            program.emit = (targetSourceFile, _writeFile, ...restEmitArgs) => {
                const emitResult = originalEmit(targetSourceFile, createWriteFileHook(files), ...restEmitArgs);
                if (!emitResult.emitSkipped) {
                    hooks.afterEmit({ files });
                }
                return emitResult;
            }
            return program;
        },
        printDiagnostic,
        printDiagnostic,
    ));
}

export function transpile(options: TypeScriptOptions, hooks: TypeScriptHooks) {
    (options.watch ? transpileWatch : transpileOnce)(options, hooks);
}
