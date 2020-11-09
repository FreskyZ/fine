import * as fs from 'fs';
import * as path from 'path';
import * as sm from 'source-map';
import { projectDirectory } from './common';

// watch does not log output
export async function merge(file: string, watch: boolean): Promise<void> {

    const generator = new sm.SourceMapGenerator({ file: 'server.js', sourceRoot: '' });
    const consumer1s: { [key: string]: sm.BasicSourceMapConsumer } = {};

    const rawConsumer2 = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const consumer2 = await new sm.SourceMapConsumer(rawConsumer2);

    for (const rawOriginalFile of consumer2.sources) {
        if (!rawOriginalFile.startsWith('webpack://fps/build/')) continue;
        const originalFile = rawOriginalFile.slice(14);

        const originalMap = path.join(projectDirectory, originalFile + '.map');
        if (!fs.existsSync(originalMap)) continue;
        
        if (!(originalMap in consumer1s)) {
            consumer1s[originalMap] = await new sm.SourceMapConsumer(JSON.parse(fs.readFileSync(originalMap, 'utf-8')));
        }

        const consumer1 = consumer1s[originalMap];
        consumer1.eachMapping(({ originalLine: originalOriginalLine, originalColumn: originalOriginalColumn, generatedLine: originalLine, generatedColumn: originalColumn }) => {
            const generatedPosition = consumer2.generatedPositionFor({ line: originalLine, column: originalColumn, source: rawOriginalFile });
            if (generatedPosition.line == null || generatedPosition.column == null) return;

            generator.addMapping({
                source: 'src' + originalFile.slice(5, -3) + '.ts',
                original: { line: originalOriginalLine, column: originalOriginalColumn },
                generated: { line: generatedPosition.line, column: generatedPosition.column },
            });
        });
    }

    fs.writeFileSync(file, generator.toString());
    if (!watch) {
        // smm: source map merger
        console.log('[smm] source map merged');
    }
}
