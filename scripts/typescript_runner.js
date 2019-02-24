const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const chalk = require('chalk');
const filesize = require('filesize');
const ts = require('typescript');
const buildConfig = require('./build_config');
const Reporter = require('./reporter');

// it's just a console wrapper, leave it global
const reporter = new Reporter('typescript');
const diagnosticCategories = [ 
    { name: 'warning', color: 'red' }, 
    { name: 'error', color: 'red' },
    { name: 'suggestion', color: 'green' },
    { name: 'message', color: 'cyan' }
];
const projectDirectory = process.cwd();

function getDiagnosticsSummary(diagnostics) {
    const errorCount = diagnostics
        .filter(d => d.category == ts.DiagnosticCategory.Error || d.category == ts.DiagnosticCategory.Warning).length;
    const normalCount = diagnostics.length - errorCount;
    
    let message;
    if (errorCount == 0 && normalCount == 0) {
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

// type: normal | watch-status-change 
function printDiagnostic({ category, code, messageText, file, start }, type = 'normal') {
    const { name: categoryName, color: categoryColor } = diagnosticCategories[category];
    const displayCode = chalk[categoryColor](`TS${code} `);
    const displayMessage = ts.flattenDiagnosticMessageText(messageText, '\n');
    
    let fileAndPosition = '';
    if (file) {
        const { line, character: column } = ts.getLineAndCharacterOfPosition(file, start);
        const fileName = path.relative(projectDirectory, file.fileName);
        fileAndPosition = chalk.yellow(`${fileName}:${line + 1}:${column + 1} `);
    }

    if (type == 'normal') {
        reporter.write(displayCode + fileAndPosition + displayMessage);
    } else if (type == 'watch-status-change') {
        reporter.writeWithHeader(displayCode + fileAndPosition + displayMessage);
    }
}

module.exports = class TypeScriptCompiler extends EventEmitter {
    constructor({ configName }) {
        super();

        this.mode = null; // null | run | watch, run/watch can only be called once
        this.rootNames = buildConfig[`tsc:${configName}:roots`];
        this.compilerOptions = buildConfig[`tsc:${configName}:options`];
    }

    _hookOutput(host, outputFileSystem) {
        host.writeFile = (fileName, content, _writeBOM, onError, sourceFiles) => {
            reporter.write(chalk`  emit {yellow ${fileName}} {gray size} ${filesize(content.length)}`);

            try {
                outputFileSystem.mkdirpSync(path.dirname(fileName));
                outputFileSystem.writeFileSync(fileName, content);
            } catch (e) {
                onError(e);
            }
        };

        // NOTE: tsc is keeping creating directory if you only overwrite host.writeFile
        // but if you overwrite createDirectory like this, webpack/memory-fs will complain 'file already exists'
        // host.createDirectory = path => outputFileSystem.mkdirSync(path);
        // so just make it null here, because host.createDirectory is nullable in definition
        // ATTENTION: this property is marked internal and maybe changed in future
        host.createDirectory = null;
    }
    _hookProgramCreated(host) {
        const originalAfterProgramCreate = host.afterProgramCreate;
        host.afterProgramCreate = program => {
            reporter.writeWithHeader('transpiled');
            if (originalAfterProgramCreate) originalAfterProgramCreate(program);
        };
    }

    run({ outputFileSystem = fs }) {
        if (this.mode != null) throw new Error('already in mode ' + this.mode);
        this.mode = 'run';

        // according to source code, create program parameter's config is used
        const host = ts.createCompilerHost({});
        this._hookOutput(host, outputFileSystem);
        // this._hookProgramCreated(host);

        const program = ts.createProgram({ rootNames: this.rootNames, options: this.compilerOptions, host });

        reporter.writeWithHeader('transpiling');
        const { diagnostics } = program.emit();
        const { success, message: summary } = getDiagnosticsSummary(diagnostics);
        reporter.writeWithHeader('transpiled with ' + summary);
        diagnostics.map(d => printDiagnostic(d, 'normal'));
        if (diagnostics.length > 0) reporter.writeWithHeader('end of transpile diagnostics');
        
        return success;
    }

    watch({ outputFileSystem = fs }) {
        if (this.mode != null) throw new Error('already in mode ' + this.mode);
        this.mode = 'watch';

        const host = ts.createWatchCompilerHost(this.rootNames, this.compilerOptions, ts.sys, 
            ts.createEmitAndSemanticDiagnosticsBuilderProgram, d => printDiagnostic(d, 'normal'), d => {
                printDiagnostic(d, 'watch-status-change');
                if (d.code == 6194 && typeof d.messageText == 'string' && d.messageText.startsWith('Found 0')) {
                    this.emit('after-watch-recompile');
                }
            });
        this._hookOutput(host, outputFileSystem);
        // this._hookProgramCreated(host);

        ts.createWatchProgram(host);
    }
};
