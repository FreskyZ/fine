import * as ts from 'typescript';
import * as chalk from 'chalk';

export type CompilerOptions = ts.CompilerOptions;

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
function printDiagnostic(
    type: 'normal' | 'watch-status-change' = 'normal',
    { category, code, messageText, file, start }: ts.Diagnostic): void {

    const categoryColor = diagnosticCategoryColors[category];
    const displayCode = type == 'watch-status-change'
        && (code == 6031 || code == 6032 || code == 6194) ? chalk`[tsc] ` : categoryColor(`  TS${code} `);

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

// TODO: change back to not async because run-webpack is changing

// although not needed, make this async to look like run-webpack and run-source-map
export function compile(entry: string | string[], additionalOptions: Partial<ts.CompilerOptions>) {
    // tsc: typescript compiler
    console.log(`[tsc] transpiling ${entry}`);

    const options = { 
        ...basicOptions, 
        ...additionalOptions, 
        lib: 'lib' in additionalOptions ? [...basicOptions.lib, ...additionalOptions.lib] : basicOptions.lib,
    };
    const program = ts.createProgram(Array.isArray(entry) ? entry : [entry], options);
    const { diagnostics } = program.emit();
    const { success, message: summary } = summaryDiagnostics(diagnostics);
    console.log(chalk`[tsc] transpile completed with ${summary}`);
    diagnostics.map(d => printDiagnostic('normal', d));
    if (diagnostics.length > 0) {
        console.log('[tsc] end of transpile diagnostics');
    }
    
    return success;
}

export function watch(entry: string, additionalOptions: Partial<ts.CompilerOptions>): void {
    console.log(`[tsc] transpiling watching ${entry}`);

    ts.createWatchProgram(ts.createWatchCompilerHost(
        [entry],
        { ...basicOptions, ...additionalOptions },
        ts.sys,
        ts.createEmitAndSemanticDiagnosticsBuilderProgram,
        diagnostic => printDiagnostic('normal', diagnostic),
        diagnostic => printDiagnostic('watch-status-change', diagnostic),
    ));
}
