// https://webpack.js.org/api/stats/

export interface WebpackStatModule {
    id: number,
    identifier: string,
    name: string,
    size: number,
    built: boolean,
    codeGenerated: boolean,
    cached: boolean,
    cacheable: boolean,
    optional: boolean,
    prefetched: boolean,
    modules: any[], // optimize.concat modules seems using this
}

export interface WebpackStatChunk {
    id: number,
    files: string[],
    size: number,
    modules: WebpackStatModule[],
    rendered: boolean,
    entry: boolean,
    initial: boolean,
    recorded: boolean,
}

export interface WebpackStatAsset {
    chunkNames: string[],
    chunks: number[],
    name: string,
    size: number,
}

export interface WebpackStat {
    hash: string,
    time: number, // millisecond
    publicPath: string,
    outputPath: string,
    errorsCount: number,
    errors: { message: string, [other: string]: any }[],
    warningsCount: number,
    warnings: { message: string, [other: string]: any }[],
    assets: WebpackStatAsset[],
    chunks: WebpackStatChunk[],
    modules: WebpackStatModule[];
}
