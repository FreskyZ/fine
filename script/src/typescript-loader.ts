import * as path from 'path';
import chalk from 'chalk';
import * as sourcemap from 'source-map';
import * as ts from 'typescript';
import * as webpack from 'webpack';
import Logger from './logger';

const projectDirectory = process.cwd();

// the `webpack.loader.LoaderContext` from DefinitelyTyped
//    amazingly conflicts with newest source map's definition
// (DefinitelyTyped's webpack.loader.LoaderContext.callback's parameter 3 is uglify-js/source-map
//    which is very different from newest source map's definition)
// because loader context is not very long
interface LoaderContext {
    query: any,
    resourcePath: string;
    async(): (err: Error | null, content: string | Buffer, sourceMap?: sourcemap.RawSourceMap) => void;
    emitWarning(warning: string | Error): void;
    emitError(err: string | Error): void;
}

export interface TypeScriptLoaderOptions {
    compilerOptions?: ts.CompilerOptions;
}

const typescriptBaseConfig: ts.CompilerOptions = {
    module: ts.ModuleKind.CommonJS,
    allowSyntheticDefaultImports: true,
    target: ts.ScriptTarget.ES2018,
    noEmitOnError: true,
    noErrorTruncation: true,
    noFallthroughCaseInSwitch: true,
    noImplicitAny: true,
    noImplicitReturns: true,
    noImplicitThis: true,
    noUnusedLocals: true,
    noUnusedParameters: true,
    strict: true,
    strictFunctionTypes: true,
    strictBindCallApply: true,
    strictNullChecks: true,
    strictPropertyInitialization: true,
    removeComments: true,
    sourceMap: true,
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
        message = chalk`{yellow ${normalCount}} normal diagnostics`;
    } else if (normalCount == 0 /* && errorCount != 0 */) {
        message = chalk`{yellow ${errorCount}} errors`;
    } else /* normalCount != 0 && errorCount != 0 */ {
        message = chalk`{yellow ${errorCount}} errors and {yellow ${normalCount}} normal diagnostics`;
    }

    return { success: errorCount == 0, message };
}
function printDiagnostic(
    logger: Logger,
    type: 'normal' | 'watch-status-change' = 'normal',
    { category, code, messageText, file, start }: ts.Diagnostic): void {

    const categoryColor = diagnosticCategoryColors[category];
    const displayCode = type == 'watch-status-change'
        && (code == 6031 || code == 6032) ? chalk`{inverse TS${code}} ` : categoryColor(`  TS${code} `);

    let fileAndPosition = '';
    if (file) {
        const { line, character: column } = ts.getLineAndCharacterOfPosition(file, start!);
        const fileName = path.relative(projectDirectory, file.fileName);
        fileAndPosition = chalk`{yellow ${fileName}:${line + 1}:${column + 1}}`;
    }

    const result = displayCode + fileAndPosition + ts.flattenDiagnosticMessageText(messageText, '\n');

    if (type == 'normal') {
        logger.write(result);
    } else {
        logger.header().write(result);
    }
}

export default function loader(this: LoaderContext,
    /* typescript loader does not care about entry file content */ _content: string | Buffer,
    /* first loader does not have source map */ _sourceMap: sourcemap.RawSourceMap | undefined): void {

    const callback = this.async();
    const logger = new Logger('typescript').header().write('transpiling');

    const loaderOptions = this.query as TypeScriptLoaderOptions;
    const compilerOptions = Object.assign({}, typescriptBaseConfig, loaderOptions.compilerOptions) as ts.CompilerOptions;

    // according to source code, create program parameter's config is used
    const host = ts.createCompilerHost({});
    const program = ts.createProgram({ rootNames: [this.resourcePath], options: compilerOptions, host });

    const writeFileCache: { [jsName: string]: { jsContent: string, mapContent: string } } = {};
    host.writeFile = (fileName: string, content: string,
        writeBOM: boolean, onError?: (message: string) => void, _sourceFiles?: ReadonlyArray<ts.SourceFile>): void => {

        const isJs = path.extname(fileName) == '.js';
        const jsName = isJs ? fileName : path.join(path.dirname(fileName), path.basename(fileName, '.map'));
        if (jsName in writeFileCache) {
            // TODOX: this.addDependency
        } else if (isJs) {
            writeFileCache[jsName] = { jsContent: content, mapContent: '' };
        } else {
            writeFileCache[jsName] = { jsContent: '', mapContent: content };
        }
    };

    const { diagnostics } = program.emit();
    const { success, message: summary } = summaryDiagnostics(diagnostics);

    logger.header().write(chalk`{cyan transpiled} with ${summary}`);
    diagnostics.map(d => printDiagnostic(logger, 'normal', d));
    if (diagnostics.length > 0) logger.header().write(chalk`{cyan end of transpile result}`);

    if (!success) {
        this.emitError('transpiled error occured, see previous errors');
    }

    callback(null, '');
};

