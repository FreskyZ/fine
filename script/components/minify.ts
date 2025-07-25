import { minify } from 'terser';
import { logError } from './common.ts';

// the try catch structure of minify is hard to use, return null for not ok
export async function tryminify(input: string) {
    try {
        const minifyResult = await minify(input, {
            module: true,
            compress: { ecma: 2022 as any },
            format: { max_line_len: 160 },
        });
        return minifyResult.code;
    } catch (err) {
        logError('terser', `minify error`, { err, input });
        return null;
    }
}
