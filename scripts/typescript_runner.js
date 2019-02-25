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
    const displayCode = type == 'watch-status-change' && (code == 6031 || code == 6032) 
        ? chalk`{inverse TS${code}} ` : chalk[categoryColor](`TS${code} `);
    const displayMessage = ts.flattenDiagnosticMessageText(messageText, '\n');
    
    let fileAndPosition = '';
    if (file) {
        const { line, character: column } = ts.getLineAndCharacterOfPosition(file, start);
        const fileName = path.relative(projectDirectory, file.fileName);
        fileAndPosition = chalk.yellow(`${fileName}:${line + 1}:${column + 1} `);
    }

    const result = displayCode + fileAndPosition + displayMessage;
    if (type == 'normal') {
        reporter.write(result);
    } else if (type == 'watch-status-change') {
        reporter.writeWithHeader(result);
    }
}

module.exports = class TypeScriptCompiler extends EventEmitter {
    constructor({ configName }) {
        super();

        this.mode = null; // null | run | watch, run/watch can only be called once
        this.rootNames = buildConfig[`tsc:${configName}:roots`];
        this.compilerOptions = buildConfig[`tsc:${configName}:options`];

        // emit file report
        this.emittingFiles = false;
        this.emittedFiles = []; // { name, size, mapSize }
    }

    _markStartEmitting() {
        this.emittingFiles = true;
    }
    _markStopEmitting() {
        this.emittingFiles = false;
        const emittedFiles = this.emittedFiles.slice();
        this.emittedFiles = [];

        for (const { name, size, mapSize } of emittedFiles) {
            reporter.write(chalk`  emit {yellow ${name}} ` 
                + chalk`{gray size} ${filesize(size)} {gray -.js.map size} ${filesize(mapSize)}`);
        }
    }
    _hookOutput(host, outputFileSystem) {
        host.writeFile = (fileName, content, _writeBOM, onError, sourceFiles) => {
            
            if (this.emittingFiles) {
                const isJs = path.extname(fileName) == '.js';
                const jsName = isJs ? fileName : path.join(path.dirname(fileName), path.basename(fileName, '.map'));
                const maybeEntry = this.emittedFiles.find(f => f.name == jsName);
                if (maybeEntry != null) {
                    if (isJs) {
                        maybeEntry.size = content.length;
                    } else {
                        maybeEntry.size = content.length;
                    }
                } else {
                    if (isJs) {
                        this.emittedFiles.push({ name: jsName, size: content.length, mapSize: 0 });
                    } else {
                        this.emittedFiles.push({ name: jsName, size: 0, mapSize: content.length });
                    }
                }   
            } else {
                reporter.write(chalk`  emit {yellow ${fileName}} {gray size} ${filesize(content.length)}`);
            }

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

        reporter.writeWithHeader(chalk`{cyan transpiling}`);

        this._markStartEmitting();
        const { diagnostics } = program.emit();
        this._markStopEmitting();

        const { success, message: summary } = getDiagnosticsSummary(diagnostics);
        reporter.writeWithHeader(chalk`{cyan transpiled} with ${summary}`);
        diagnostics.map(d => printDiagnostic(d, 'normal'));
        if (diagnostics.length > 0) reporter.writeWithHeader(chalk`{cyan end of transpile diagnostics}`);
        return success;
    }

    watch({ outputFileSystem = fs }) {
        if (this.mode != null) throw new Error('already in mode ' + this.mode);
        this.mode = 'watch';

        const host = ts.createWatchCompilerHost(this.rootNames, this.compilerOptions, ts.sys, 
            ts.createEmitAndSemanticDiagnosticsBuilderProgram, d => printDiagnostic(d, 'normal'), d => {
                printDiagnostic(d, 'watch-status-change');
                if (d.code == 6031 || d.code == 6032) {
                    this._markStartEmitting();
                }
                if (d.code == 6194) {
                    this._markStopEmitting();
                    if (typeof d.messageText == 'string' && d.messageText.startsWith('Found 0')) {
                        this.emit('after-watch-recompile');
                    }
                }
            });
        this._hookOutput(host, outputFileSystem);
        // this._hookProgramCreated(host);

        ts.createWatchProgram(host);
    }
};
