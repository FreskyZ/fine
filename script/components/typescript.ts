import ts from 'typescript';
import { logInfo, logError } from './logger.ts';
import chalk from 'chalk-template';
import chalkNotTemplate from 'chalk';

export interface TypeScriptContext {
    entry: string | string[],
    // not confused with ts.ScriptTarget
    // for now this add lib.dom.d.ts to lib, add jsx: ReactJSX
    target: 'browser' | 'node',
    // should come from process.env.AKARIN_STRICT
    // in old days I enabled this and meet huge amount of false positives,
    // so instead of always on/off, occassionally use this to check for potential issues
    strict?: boolean,
    additionalOptions?: ts.CompilerOptions,
    additionalLogHeader?: string,
    program?: ts.Program,
    // transpile success
    success?: boolean,
    // transpile result files
    files?: Record<string, string>,
}

export function transpile(tcx: TypeScriptContext): TypeScriptContext {
    const logheader = `tsc${tcx.additionalLogHeader ?? ''}`;
    logInfo(logheader, 'transpiling');
    
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
    //
    // NOTE check https://www.typescriptlang.org/tsconfig/ for new features and options
    tcx.program = ts.createProgram(Array.isArray(tcx.entry) ? tcx.entry : [tcx.entry], {
        lib: ['lib.esnext.d.ts'].concat(tcx.target == 'browser' ? ['lib.dom.d.ts'] : []),
        jsx: tcx.target == 'browser' ? ts.JsxEmit.ReactJSX : undefined,
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        skipLibCheck: true,
        noEmitOnError: true,
        strict: tcx.strict,
        allowUnreachableCode: false,
        allowUnusedLabels: false,
        alwaysStrict: true,
        exactOptionalPropertyTypes: tcx.strict,
        noFallthroughCaseInSwitch: true,
        noImplicitAny: true,
        noImplicitReturns: true,
        noImplicitThis: true,
        noPropertyAccessFromIndexSignature: true,
        noUnusedLocals: true,
        noUnusedParameters: true,
        strictNullChecks: tcx.strict,
        strictFunctionTypes: true,
        strictBindCallApply: true,
        strictBuiltinIteratorReturn: true,
        strictPropertyInitialization: tcx.strict,
        removeComments: true,
        outDir: '/vbuild',
        ...tcx.additionalOptions,
    });

    tcx.files ??= {};
    const emitResult = tcx.program.emit(undefined, (fileName, data) => {
        if (data) { tcx.files[fileName] = data; }
    });

    // TODO the typescript level top level item tree shaking is nearly completed by the unusedvariable, etc. check
    // the only gap is an item is declared as export but not used by other modules
    // the complexity of this check is even reduced by named imports in ecma module compare to commonjs module,
    // although default import and namespace import still exists, soyou still need typescript type information
    // to find top level item usages, so still need something to be collected here?

    const diagnostics = tcx.additionalOptions?.noEmit ? [
        // why are there so many kinds of diagnostics? do I need all of them?
        tcx.program.getGlobalDiagnostics(),
        tcx.program.getOptionsDiagnostics(),
        tcx.program.getSemanticDiagnostics(),
        tcx.program.getSyntacticDiagnostics(),
        tcx.program.getDeclarationDiagnostics(),
        tcx.program.getConfigFileParsingDiagnostics(),
    ].flat() : emitResult.diagnostics;

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

    tcx.success = diagnostics.length == 0;
    (diagnostics.length ? logError : logInfo)(logheader, `completed with ${message}`);
    for (const { category, code, messageText, file, start } of diagnostics) {
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
    return tcx;
}
