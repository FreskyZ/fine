import * as fs from 'fs';
import * as sm from 'source-map';

export async function merge(file: string) {
    // smm: source map merger
    console.log('[smm] source map merging');

    const generator = new sm.SourceMapGenerator({ file: 'server.js', sourceRoot: '' });
    const consumer1s: { [key: string]: sm.BasicSourceMapConsumer } = {};

    const consumer2 = await new sm.SourceMapConsumer(JSON.parse(fs.readFileSync(file, 'utf-8')));
    consumer2.computeColumnSpans();
    const consumer2Mappings: sm.MappingItem[] = [];
    consumer2.eachMapping(m => consumer2Mappings.push(m));

    for (const { generatedLine, generatedColumn, source, originalLine, originalColumn } of consumer2Mappings) {
        if (source == null || originalLine == null || originalColumn == null) continue;

        if (!source.startsWith('webpack://fps/build/')) continue;
        const actualSource = source.slice(14); // remove 'webpack://fps/'

        const sourceFileMapFileName = actualSource + '.map';
        if (!fs.existsSync(sourceFileMapFileName)) continue;

        if (!(sourceFileMapFileName in consumer1s)) {
            consumer1s[sourceFileMapFileName] = await new sm.SourceMapConsumer(JSON.parse(fs.readFileSync(sourceFileMapFileName, 'utf-8')));
        }

        const consumer1 = consumer1s[sourceFileMapFileName];
        let { line: actualOriginalLine, column: actualOriginalColumn } = consumer1.originalPositionFor({ line: originalLine, column: originalColumn });
        if (actualOriginalLine == null || actualOriginalColumn == null) {
            const { line: actualOriginalLine2, column: actualOriginalColumn2 } = consumer1.originalPositionFor({ line: originalLine, column: originalColumn, bias: sm.SourceMapConsumer.LEAST_UPPER_BOUND });
            if (actualOriginalLine == null || actualOriginalColumn == null) continue;
            [actualOriginalLine, actualOriginalColumn] = [actualOriginalLine2, actualOriginalColumn2];
        }

        generator.addMapping({ 
            source: 'src' + actualSource.slice(5, -2) + 'ts',
            original: { line: actualOriginalLine!, column: actualOriginalColumn! },
            generated: { line: generatedLine, column: generatedColumn },
        });
    }

    fs.writeFileSync(file, generator.toString());
    console.log('[smm] source map merged');
}