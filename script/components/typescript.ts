import ts from 'typescript';
import { logInfo, logError } from './logger';
import chalk from 'chalk-template';
import chalkNotTemplate from 'chalk';

interface MyTypescriptOptions {
    entry: string,
    // not confused with ts.ScriptTarget
    // for now this add lib.dom.d.ts to lib, add jsx: ReactJSX
    target: 'browser' | 'node',
    // the /vbuild, or /vbuild1 if you'd like
    outputDirectory: string,
    // should come from process.env.AKARIN_STRICT
    // in old days I enabled this and meet huge amount of false positives,
    // so instead of always on/off, occassionally use this to check for potential issues
    strict?: boolean,
    additionalOptions?: ts.CompilerOptions,
}

export function createTypescriptProgram(options: MyTypescriptOptions): ts.Program {
    // design considerations
    // - the original tool distinguishes ecma module and commonjs, now everything is esm!
    //   the target: esnext, module: nodenext, moduleres: nodenext seems suitable for all usage
    // - no source map
    //   the original core module include source map and do complex error logs,
    //   but that work really should not be put in core module and that's now removed
    //   currently the minify option to split result in 160 char wide lines is very enough
    //   the result backend bundle file and front end js files is currently actually very human readable
    // - jsx, I was providing my own jsx implementation,
    //   but that's now handled by /** @jsxImportSource @emotion/react */, so no work for me
    // - watch is not used in current remote command center architecture

    // NOTE check https://www.typescriptlang.org/tsconfig/ for new features and options
    return ts.createProgram([options.entry], {
        lib: ['lib.esnext.d.ts'].concat(options.target == 'browser' ? ['lib.dom.d.ts'] : []),
        jsx: options.target == 'browser' ? ts.JsxEmit.ReactJSX : undefined,
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        skipLibCheck: true,
        noEmitOnError: true,
        strict: options.strict,
        allowUnreachableCode: false,
        allowUnusedLabels: false,
        alwaysStrict: true, // TODO is this important?
        exactOptionalPropertyTypes: options.strict,
        noFallthroughCaseInSwitch: true,
        noImplicitAny: true,
        noImplicitReturns: true,
        noImplicitThis: true,
        noPropertyAccessFromIndexSignature: true, // TODO try this
        noUnusedLocals: true,
        noUnusedParameters: true,
        strictNullChecks: options.strict,
        strictFunctionTypes: true,
        strictBindCallApply: true,
        strictBuiltinIteratorReturn: true,
        strictPropertyInitialization: true,
        removeComments: true,
        // this is not needed in build scripts, because they are real transpiled
        // TODO noemit check build scripts itself with this option
        // erasableSyntaxOnly: true,
        outDir: options.outputDirectory,
        ...options.additionalOptions,
    });
}

// return null for failure
export function transpile(program: ts.Program): Record<string, string> {
    logInfo('tsc', 'transpiling');

    const files: Record<string, string> = {};
    const emitResult = program.emit(undefined, (fileName, data) => {
        if (data) { files[fileName] = data; }
    });

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
    for (const { category, code, messageText, file, start } of emitResult.diagnostics) {
        const displayColor = {
            [ts.DiagnosticCategory.Warning]: chalkNotTemplate.red,
            [ts.DiagnosticCategory.Error]: chalkNotTemplate.red,
            [ts.DiagnosticCategory.Suggestion]: chalkNotTemplate.green,
            [ts.DiagnosticCategory.Message]: chalkNotTemplate.cyan,
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

    return emitResult.emitSkipped ? null : files;
}
