import * as ts from 'typescript';
import * as chalk from 'chalk';

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
        && (code == 6031 || code == 6032) ? chalk`{inverse TS${code}} ` : categoryColor(`  TS${code} `);

    let fileAndPosition = '';
    if (file) {
        const { line, character: column } = ts.getLineAndCharacterOfPosition(file, start!);
        fileAndPosition = chalk`{yellow ${file.fileName}:${line + 1}:${column + 1}} `;
    }

    let flattenedMessage = ts.flattenDiagnosticMessageText(messageText, '\n');
    if (flattenedMessage.includes('\n')) {
        flattenedMessage = '\n' + flattenedMessage;
    }
    console.log(displayCode + fileAndPosition + flattenedMessage);
}

export function compile(entry: string, additionalOptions: Partial<ts.CompilerOptions>) {
    // tsc: typescript compiler
    console.log(`[tsc] transpiling ${entry}`);

    const program = ts.createProgram([entry], { ...basicOptions, ...additionalOptions });
    const { diagnostics } = program.emit();
    const { success, message: summary } = summaryDiagnostics(diagnostics);
    console.log(chalk`[tsc] transpile completed with ${summary}`);
    diagnostics.map(d => printDiagnostic('normal', d));
    if (diagnostics.length > 0) {
        console.log(`[tsc] end of transpile diagnostics`);
    }
    
    return success;
}
