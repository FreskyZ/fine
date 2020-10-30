"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const chalk_1 = require("chalk");
const ts = require("typescript");
const logger_1 = require("./logger");
const projectDirectory = process.cwd();
const typescriptBaseConfig = {
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
    [ts.DiagnosticCategory.Warning]: chalk_1.default.red,
    [ts.DiagnosticCategory.Error]: chalk_1.default.red,
    [ts.DiagnosticCategory.Suggestion]: chalk_1.default.green,
    [ts.DiagnosticCategory.Message]: chalk_1.default.cyan,
};
function summaryDiagnostics(diagnostics) {
    const errorCount = diagnostics.filter(d => d.category == ts.DiagnosticCategory.Error || ts.DiagnosticCategory.Warning).length;
    const normalCount = diagnostics.length - errorCount;
    let message;
    if (normalCount == 0 && errorCount == 0) {
        message = 'no diagnostic';
    }
    else if (normalCount != 0 && errorCount == 0) {
        message = chalk_1.default `{yellow ${normalCount}} normal diagnostics`;
    }
    else if (normalCount == 0 /* && errorCount != 0 */) {
        message = chalk_1.default `{yellow ${errorCount}} errors`;
    }
    else /* normalCount != 0 && errorCount != 0 */ {
        message = chalk_1.default `{yellow ${errorCount}} errors and {yellow ${normalCount}} normal diagnostics`;
    }
    return { success: errorCount == 0, message };
}
function printDiagnostic(logger, type = 'normal', { category, code, messageText, file, start }) {
    const categoryColor = diagnosticCategoryColors[category];
    const displayCode = type == 'watch-status-change'
        && (code == 6031 || code == 6032) ? chalk_1.default `{inverse TS${code}} ` : categoryColor(`  TS${code} `);
    let fileAndPosition = '';
    if (file) {
        const { line, character: column } = ts.getLineAndCharacterOfPosition(file, start);
        const fileName = path.relative(projectDirectory, file.fileName);
        fileAndPosition = chalk_1.default `{yellow ${fileName}:${line + 1}:${column + 1}}`;
    }
    const result = displayCode + fileAndPosition + ts.flattenDiagnosticMessageText(messageText, '\n');
    if (type == 'normal') {
        logger.write(result);
    }
    else {
        logger.header().write(result);
    }
}
function loader(
/* typescript loader does not care about entry file content */ _content, 
/* first loader does not have source map */ _sourceMap) {
    const callback = this.async();
    const logger = new logger_1.default('typescript').header().write('transpiling');
    const loaderOptions = this.query;
    const compilerOptions = Object.assign({}, typescriptBaseConfig, loaderOptions.compilerOptions);
    // according to source code, create program parameter's config is used
    const host = ts.createCompilerHost({});
    const program = ts.createProgram({ rootNames: [this.resourcePath], options: compilerOptions, host });
    const writeFileCache = {};
    host.writeFile = (fileName, content, writeBOM, onError, _sourceFiles) => {
        const isJs = path.extname(fileName) == '.js';
        const jsName = isJs ? fileName : path.join(path.dirname(fileName), path.basename(fileName, '.map'));
        if (jsName in writeFileCache) {
            // TODOX: this.addDependency
        }
        else if (isJs) {
            writeFileCache[jsName] = { jsContent: content, mapContent: '' };
        }
        else {
            writeFileCache[jsName] = { jsContent: '', mapContent: content };
        }
    };
    const { diagnostics } = program.emit();
    const { success, message: summary } = summaryDiagnostics(diagnostics);
    logger.header().write(chalk_1.default `{cyan transpiled} with ${summary}`);
    diagnostics.map(d => printDiagnostic(logger, 'normal', d));
    if (diagnostics.length > 0)
        logger.header().write(chalk_1.default `{cyan end of transpile result}`);
    if (!success) {
        this.emitError('transpiled error occured, see previous errors');
    }
    callback(null, '');
}
exports.default = loader;
;
