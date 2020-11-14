import * as ts from 'typescript';
import * as chalk from 'chalk';

export const ModuleKind = ts.ModuleKind;
export const ModuleResolutionKind = ts.ModuleResolutionKind;
export type CompilerOptions = ts.CompilerOptions & {
    readFileHook?: (fileName: string, originalReadFile: (filename: string) => string) => string,
    writeFileHook?: (fileName: string, data: string, writeByteOrderMark: boolean, onError: (message: string) => void, sourceFiles: readonly ts.SourceFile[], originalWriteFile: ts.WriteFileCallback) => void,
    watchReadFileHook?: (path: string, encoding: string, originalReadFile: (path: string, encoding?: string) => string) => string,
    watchWriteFileHook?: (path: string, data: string, writeBOM: boolean, originalWriteFile: (path: string, data: string, writeBOM?: boolean) => void) => void,
};

// NOTE for "chunk-split-like" feature
// server-core, shared and apps and designed to be separately built and hot reloaded
// 1. shared types are simple because they are not considered in output (or emit stage)
// 2. shared logics for server codes are kind of simple
//    1. for server-core, set transpile output to 'build' instead of 'build/server-core' is enough, 
//       server-core result is in 'build/server-core' and 'shared' result in 'build/shared',
//       webpack will continue to work because it merges all files, shared is designed to be merged
//    2. for app server and client, except set output directory to 'build', 
//       a redirect from 'build/app' to 'build/app-server' or 'build/app-client' is needed in write file hook
// 3. app-server is complex, it theoretically should use typescript project reference feature, *BUT*, 
//    1. this feature is not publically available in compiler api (or node api)
//       (actually the whole compiler api is not very public)
//    2. investigate in source code is complex, also I currently did not find internal documents about this feature. 
//    3. this feature will also add a ".tsBuildInfo" file in root directory, 
//       which kind of do not meet my project's "no webpack config and tsconfig" requirement
// 4. so, in consider of app-server's export is very simple (export { controller: express.Router })
//    it is implemented by
//    1. hook read file and change import statement in api.ts to same directory 'import { controller } from './app'
//    2. hook read file and return dummy empty implementation for the dummy file
//    3. hook write file and change back the dummy import statement
//    4. externalize app-server in webpack config

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
    const categoryColor = diagnosticCategoryColors[category];
    const displayCode = code == 6031 || code == 6032 ? chalk`[{cyan tsc}] ` : categoryColor(`  TS${code} `);

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

function createCompilerHost(options: CompilerOptions) {
    const host = ts.createCompilerHost(options);

    if (options.readFileHook) {
        const originalReadFile = host.readFile;
        host.readFile = fileName => options.readFileHook(fileName, originalReadFile);
    }
    if (options.writeFileHook) {
        const originalWriteFile = host.writeFile;
        host.writeFile = (fileName, data, writeBOM, onError, sourceFiles) => options.writeFileHook(fileName, data, writeBOM, onError, sourceFiles, originalWriteFile);
    }

    return host;
}

// although not needed, make this async to look like run-webpack and run-source-map
export function compile(entry: string | string[], additionalOptions: CompilerOptions) {
    // tsc: typescript compiler
    console.log(`[tsc] transpiling ${entry}`);

    const options = { 
        ...basicOptions, 
        ...additionalOptions, 
        lib: 'lib' in additionalOptions ? [...basicOptions.lib, ...additionalOptions.lib] : basicOptions.lib,
    } as unknown as ts.CompilerOptions; // typescript says writeFileHook and readFileHook is not compatible with the definition because the index property, ignore it

    const host = createCompilerHost(options);
    const program = ts.createProgram(Array.isArray(entry) ? entry : [entry], options, host);
    const { diagnostics } = program.emit();
    const { success, message: summary } = summaryDiagnostics(diagnostics);
    console.log(chalk`[tsc] transpile completed with ${summary}`);
    diagnostics.map(printDiagnostic);
    if (diagnostics.length > 0) {
        console.log('[tsc] end of transpile diagnostics');
    }
    
    return success;
}

export function watch(entry: string, additionalOptions: CompilerOptions): void {
    console.log(`[tsc] transpiling watching ${entry}`);

    if (additionalOptions.watchReadFileHook) {
        const originalReadFile = ts.sys.readFile;
        ts.sys.readFile = (path, encoding) => additionalOptions.watchReadFileHook(path, encoding, originalReadFile);
    }
    if (additionalOptions.watchWriteFileHook) {
        const originalWriteFile = ts.sys.writeFile;
        ts.sys.writeFile = (path, data, writeBOM) => additionalOptions.watchWriteFileHook(path, data, writeBOM, originalWriteFile);
    }

    ts.createWatchProgram(ts.createWatchCompilerHost(
        [entry],
        { ...basicOptions, ...additionalOptions }, 
        ts.sys,
        ts.createEmitAndSemanticDiagnosticsBuilderProgram,
        printDiagnostic,
        printDiagnostic,
    ));
}
