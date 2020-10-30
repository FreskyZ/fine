// see github.com/keik/merge-source-map
//
// read from mfs's all .js.map file, read from normal fs's server.js.map, merge, write server.js.map
// check process's uncaught exception mapping
//
// solve the problem that smc.originalPositionFor({ line, column: 0 }) not working
// smc.originalPositionFor({ line, column: 4 }) may working

const fs = require('fs');
const chalk = require('chalk');
const { SourceMapConsumer, SourceMapGenerator } = require('source-map');
const buildConfig = require('./build_config');
const Reporter = require('./reporter');

const reporter = new Reporter('source-map');

module.exports = class SourceMapMerger {
    constructor({ configName }) {
        this.config = buildConfig[`source-map-merger:${configName}`];
    }

    async merge({ fileSystem }) {
        reporter.writeWithHeader(chalk.cyan('merging'));

        reporter.write(chalk`  {gray loading} webpack source map {yellow ${this.config.input}}`);
        const map2 = fileSystem.readFileSync('/dummy-build/server.js.map');
        const consumer2 = await new SourceMapConsumer(map2.toString());
        consumer2.computeColumnSpans();

        const consumer1s = {};
        const generator = new SourceMapGenerator({ file: 'server.js', sourceRoot: '' });

        const mapping2s = [];
        consumer2.eachMapping(m => mapping2s.push(m));

        for (const { generatedLine, generatedColumn, source, originalLine, originalColumn } of mapping2s) {
            if (source == null || originalLine == null || originalColumn == null) continue;
            if (source.startsWith('webpack:///external')) continue;
            
            const sourceFileName = source.startsWith('webpack://') ? source.slice(10) : source;
            if (sourceFileName == '/webpack/bootstrap') continue;

            if (!fileSystem.existsSync(sourceFileName)) continue;
            const relativeSourceFileName = sourceFileName.slice(13);

            const sourceMapFileName = sourceFileName + '.map';
            if (!fileSystem.existsSync(sourceMapFileName)) continue;

            let consumer1;
            if (sourceMapFileName in consumer1s) {
                consumer1 = consumer1s[sourceMapFileName];
            } else {
                reporter.write(chalk`  {gray loading} typescript source map {yellow ${sourceMapFileName}}`);
                const map1 = fileSystem.readFileSync(sourceMapFileName);
                consumer1 = await new SourceMapConsumer(map1.toString());
                consumer1.computeColumnSpans();
                consumer1s[sourceMapFileName] = consumer1;
            }

            let { line: originalOriginalLine, column: originalOriginalColumn }
                = consumer1.originalPositionFor({ line: originalLine, column: originalColumn });
            if (originalOriginalLine == null || originalOriginalColumn == null) {
                let { line: originalOriginalLine2, column: originalOriginalColumn2 } 
                    = consumer1.originalPositionFor({ 
                        line: originalLine, column: originalColumn, bias: SourceMapConsumer.LEAST_UPPER_BOUND });
                originalOriginalLine = originalOriginalLine2;
                originalOriginalColumn = originalOriginalColumn2;
            }
            if (originalOriginalLine == null || originalOriginalColumn == null) continue;

            generator.addMapping({ 
                source: relativeSourceFileName,
                original: { line: originalOriginalLine, column: originalOriginalColumn },
                generated: { line: generatedLine, column: generatedColumn },
            });
        }

        reporter.write(chalk`  {gray writing} final source map {yellow ${this.config.output}}`);
        fileSystem.writeFileSync(this.config.output, generator.toString());
    
        reporter.writeWithHeader(chalk.cyan('merged'));
    }
};
