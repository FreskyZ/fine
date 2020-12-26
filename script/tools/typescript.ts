import * as path from 'path';
import * as ts from 'typescript';
import * as chalk from 'chalk';
import { logError, logInfo, compileTimeConfig } from '../common';

export type TypeScriptOptions = {
    base: 'normal',
    entry: string,
    // no: no source map, normal: separated source map have source map url, hide: separated source map, no source map url
    sourceMap: 'no' | 'normal' | 'hide',
    watch: boolean,
    additionalLib?: string[],
} | {
    base: 'jsx',
    entry: string,
    sourceMap: 'normal', // only normal available for jsx
    watch: boolean,
}

export interface TypeScriptResult {
    success?: boolean, // not used when watch, because watch retranspile error will not call callback
    files: { name: string, content: string }[],
}

const basicOptions: ts.CompilerOptions = {
    lib: ['lib.esnext.d.ts'],
    target: ts.ScriptTarget.ESNext,
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
    strictFunctionTypes: true,
    strictBindCallApply: true,
    // it proves to be too boring for strict null
    // strictNullChecks: true,
    removeComments: true,
};

function mergeOptions(options: TypeScriptOptions): ts.CompilerOptions {
    return options.base == 'normal' ? {
        ...basicOptions,
        outDir: '/vbuild', // git simply virtual path to normal config 
        sourceMap: options.sourceMap != 'no',
        lib: 'additionalLib' in options ? [...basicOptions.lib, ...options.additionalLib.map(b => `lib.${b}.d.ts`)] : basicOptions.lib,
    } : {
        ...basicOptions,
        outDir: path.resolve('src'), // outdir should make output file look similar to original ts file to make webpack some path related things look proper
        target: ts.ScriptTarget.ES2018, // edge chromium android is not supporting es2020
        sourceMap: true,
        esModuleInterop: true,
        module: ts.ModuleKind.ESNext,
        jsx: ts.JsxEmit.ReactJSX,
        lib: [...basicOptions.lib, 'lib.dom.d.ts'],
    };
}

function printDiagnostic({ category, code, messageText, file, start }: ts.Diagnostic): void {
    if (code == 6031) {
        // original message is 'TS6031: Starting compilation in watch mode...'
        // ignore because transpileWatch have its own starting message
        return; 
    } else if (code == 6032) {
        // original message is 'TS6032: File change detected. Starting incremental compilation
        logInfo('tsc', 'recheck');
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
function setupReadFileHook() {
    const originalReadFile = ts.sys.readFile;
    ts.sys.readFile = (fileName, encoding) => {
        let fileContent = originalReadFile(fileName, encoding);
        if (!fileName.endsWith('.d.ts')) { // ignore .d.ts
            for (const configName in compileTimeConfig) {
                fileContent = fileContent.replaceAll(configName, compileTimeConfig[configName]);
            }
        }
        return fileContent;
    };
}

// use ts.Program.emit second parameter
function createWriteFileHook(options: TypeScriptOptions, files: TypeScriptResult['files']): ts.WriteFileCallback {
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
            if (match && options.sourceMap == 'hide') {
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

class TypeScriptChecker {
    private readonly compilerOptions: ts.CompilerOptions;
    public constructor(public readonly options: TypeScriptOptions) {
        this.compilerOptions = mergeOptions(options);
    }

    public check(): TypeScriptResult {
        logInfo('tsc', chalk`once {yellow ${this.options.entry}}`);
    
        setupReadFileHook();
        const program = ts.createProgram([this.options.entry], this.compilerOptions, ts.createCompilerHost(this.compilerOptions));
    
        const files: TypeScriptResult['files'] = [];
        const emitResult = program.emit(undefined, createWriteFileHook(this.options, files));
    
        const success = printEmitResult(emitResult);
        return { success, files };
    }

    // callback only called when watch recheck success
    public watch(callback: (result: TypeScriptResult) => any) {
        logInfo('tsc', chalk`watch {yellow ${this.options.entry}}`);

        setupReadFileHook();
    
        // NOTE: the following hooked emit will only write changed files, so this list is in this scope instead of that hook scope
        // ATTENTION: not used files (deleted and not imported) is not calling any delete, 
        //            so I (maka) cannot remove the entry by any typescript functions or hooks, related: microsoft/TypeScript#30602
        // TODO: mypack will include the unused file, I should collect all imports and remove the file from **this** array, 
        //       so there should be mechanism to let tools/mypack tell target/*.ts or this tools/typescript this thing
        // NOTE: webpack will parse entry javascript file and recursive include imported javascript files and auto ignore the removed file,
        //       so result module list is filtered and collected to cleanup **this** array
        const files: TypeScriptResult['files'] = [];
        
        // amazingly this blocks until first check and emit completes and continue
        setImmediate(() => {
            ts.createWatchProgram(ts.createWatchCompilerHost<ts.EmitAndSemanticDiagnosticsBuilderProgram>(
                [this.options.entry], 
                this.compilerOptions,
                ts.sys,
                (...createProgramArgs) => {
                    const program = ts.createEmitAndSemanticDiagnosticsBuilderProgram(...createProgramArgs);
                    const originalEmit = program.emit;
                    program.emit = (targetSourceFile, _writeFile, ...restEmitArgs) => {
                        const emitResult = originalEmit(targetSourceFile, createWriteFileHook(this.options, files), ...restEmitArgs);
                        if (!emitResult.emitSkipped) {
                            callback({ files });
                        }
                        return emitResult;
                    }
                    return program;
                },
                printDiagnostic,
                printDiagnostic,
            ));
        });
    }
}

export function typescript(options: TypeScriptOptions) { return new TypeScriptChecker(options); }
