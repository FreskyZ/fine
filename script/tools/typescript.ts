import * as path from 'path';
import * as ts from 'typescript';
import * as chalk from 'chalk';
import { logError, logInfo } from '../common';
import { config } from '../config';

export type TypeScriptOptions = {
    base: 'normal',
    entry: string | string[],
    // no: no source map, normal: separated source map have source map url, hide: separated source map, no source map url
    sourceMap: 'no' | 'normal' | 'hide',
    watch: boolean,
    additionalLib?: string[],
    configSubstitution?: boolean, // default to true, self local should not use config substitution
} | {
    base: 'jsx-page', // user-page
    entry: string,
    sourceMap: 'no',
    watch: boolean,
} | {
    base: 'jsx-app', // app-client
    entry: string,
    sourceMap: 'normal', // only normal available for jsx
    watch: boolean,
};

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
    // NOTE for strict
    // I spent some time to fix non strict warnings and a lot of tsc-is-not-clever-enough / their-document-says-this-ask-them exclamation marks
    // (one of the reasons is that my (FreskyZ@outlook.com) code is very strongly typed and well considered safe)
    // so I decided to continue this pattern, every some time use this environment variable to check for non strict warnings and possible errors, but most of the time this switch is not on
    strict: 'AKARIN_TS_STRICT' in process.env,
    noImplicitAny: true,
    noFallthroughCaseInSwitch: true,
    noImplicitReturns: true,
    noImplicitThis: true,
    noUnusedLocals: true,
    noUnusedParameters: true,
    strictNullChecks: 'AKARIN_TS_STRICT' in process.env,
    strictFunctionTypes: true,
    strictBindCallApply: true,
    removeComments: true,
};

function mergeOptions(options: TypeScriptOptions): ts.CompilerOptions {
    return options.base == 'normal' ? {
        ...basicOptions,
        outDir: '/vbuild', // git simply virtual path to normal config
        sourceMap: options.sourceMap != 'no',
        lib: 'additionalLib' in options ? [...basicOptions.lib!, ...options.additionalLib!.map(b => `lib.${b}.d.ts`)] : basicOptions.lib,
    } : options.base == 'jsx-page' ? {
        ...basicOptions,
        outDir: '/vbuild',
        target: ts.ScriptTarget.ES2018, // edge chromium android is not supporting es2020
        sourceMap: false,
        esModuleInterop: true,
        module: ts.ModuleKind.ESNext,
        jsx: ts.JsxEmit.ReactJSX,
        lib: [...basicOptions.lib!, 'lib.dom.d.ts'],
    } : /* jsx-app */ {
        ...basicOptions,
        outDir: path.resolve('src'), // outdir should make output file look similar to original ts file to make webpack some path related things look proper
        target: ts.ScriptTarget.ES2018, // edge chromium android is not supporting es2020
        sourceMap: true,
        esModuleInterop: true,
        module: ts.ModuleKind.ESNext,
        jsx: ts.JsxEmit.ReactJSX,
        lib: [...basicOptions.lib!, 'lib.dom.d.ts'],
    };
}

function printDiagnostic({ category, code, messageText, file, start }: ts.Diagnostic, additionalHeader?: string): void {
    if (code == 6031) {
        // original message is 'TS6031: Starting compilation in watch mode...'
        // ignore because transpileWatch have its own starting message
        return;
    } else if (code == 6032) {
        // original message is 'TS6032: File change detected. Starting incremental compilation
        logInfo(`tsc${additionalHeader}`, 'recheck');
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
        if (file && start) {
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

// install on ts.sys, already replace by akaric, call additional hook if exists
function setupReadFileHook() {
    const originalReadFile = ts.sys.readFile;
    ts.sys.readFile = (fileName, encoding) => {
        let fileContent = originalReadFile(fileName, encoding);
        if (!fileName.endsWith('.d.ts')) { // ignore .d.ts
            fileContent = fileContent.replaceAll('domain.com', config.domain);
            fileContent = fileContent.replaceAll('webroot', config.webroot);
            // this is special, but auth is special so ok
            if (config.apps) {
                fileContent = fileContent.replaceAll('APPSETTING', JSON.stringify(config.apps.map(a => ({ name: a.name, origin: a.origin }))));
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
    public constructor(
        public readonly options: TypeScriptOptions,
        private readonly additionalHeader?: string) {
        this.additionalHeader = this.additionalHeader ?? '';
        this.compilerOptions = mergeOptions(options);
    }

    public check(): TypeScriptResult {
        logInfo('tsc', chalk`once {yellow ${this.options.entry}}`);
        if (this.options.base != 'normal' || typeof this.options.configSubstitution == 'undefined' || this.options.configSubstitution) {
            setupReadFileHook();
        }

        const entry = Array.isArray(this.options.entry) ? this.options.entry : [this.options.entry];
        const program = ts.createProgram(entry, this.compilerOptions, ts.createCompilerHost(this.compilerOptions));

        const files: TypeScriptResult['files'] = [];
        const emitResult = program.emit(undefined, createWriteFileHook(this.options, files));

        const success = printEmitResult(emitResult);
        return { success, files };
    }

    // callback only called when watch recheck success
    public watch(callback: (result: TypeScriptResult) => any) {
        logInfo(`tsc${this.additionalHeader}`, chalk`watch {yellow ${this.options.entry}}`);
        if (this.options.base != 'normal' || typeof this.options.configSubstitution == 'undefined' || this.options.configSubstitution) {
            setupReadFileHook();
        }

        // NOTE: the following hooked emit will only write changed files, so this list is in this scope instead of that hook scope
        // ATTENTION: not used files (deleted and not imported) is not calling any delete,
        //            so it is not possible to remove the entry by any typescript functions or hooks, related: microsoft/TypeScript#30602
        // NOTE: webpack will parse entry javascript file and recursive include imported javascript files and auto ignore the removed file,
        //       so result module list is filtered and collected to cleanup **this** array
        // NOTE: mypack will match entry javascript file and bfs include imported javascript files and auto ignore the removed file,
        //       while MyPackOptions.file is exactly **this** array, mypack will cleanup this array if configured (default to true)
        const files: TypeScriptResult['files'] = [];

        const entry = Array.isArray(this.options.entry) ? this.options.entry : [this.options.entry];
        setImmediate(() => {
            // amazingly this blocks until first check and emit completes and continue
            ts.createWatchProgram(ts.createWatchCompilerHost<ts.EmitAndSemanticDiagnosticsBuilderProgram>(
                entry,
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
                    };
                    return program;
                },
                diagnostic => printDiagnostic(diagnostic, this.additionalHeader),
                diagnostic => printDiagnostic(diagnostic, this.additionalHeader),
            ));
        });
    }
}

export function typescript(options: TypeScriptOptions, additionalHeader?: string): TypeScriptChecker { return new TypeScriptChecker(options, additionalHeader); }
