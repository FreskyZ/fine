// 1. useful stat.toJson result type is not included in webpack 5 type definitions

interface ChunkGroup {
    assets: string[];
    chunks: Array<number | string>;
    children: Record<string, {
        assets: string[];
        chunks: Array<number | string>;
        name: string;
    }>;
    childAssets: Record<string, string[]>;
    isOverSizeLimit?: boolean;
}

type ReasonType
    = 'amd define'
    | 'amd require array'
    | 'amd require context'
    | 'amd require'
    | 'cjs require context'
    | 'cjs require'
    | 'context element'
    | 'delegated exports'
    | 'delegated source'
    | 'dll entry'
    | 'accepted harmony modules'
    | 'harmony accept'
    | 'harmony export expression'
    | 'harmony export header'
    | 'harmony export imported specifier'
    | 'harmony export specifier'
    | 'harmony import specifier'
    | 'harmony side effect evaluation'
    | 'harmony init'
    | 'import() context development'
    | 'import() context production'
    | 'import() eager'
    | 'import() weak'
    | 'import()'
    | 'json exports'
    | 'loader'
    | 'module.hot.accept'
    | 'module.hot.decline'
    | 'multi entry'
    | 'null'
    | 'prefetch'
    | 'require.context'
    | 'require.ensure'
    | 'require.ensure item'
    | 'require.include'
    | 'require.resolve'
    | 'single entry'
    | 'wasm export import'
    | 'wasm import';

interface Reason {
    moduleId: number | string | null;
    moduleIdentifier: string | null;
    module: string | null;
    moduleName: string | null;
    type: ReasonType;
    explanation?: string;
    userRequest: string;
    loc: string;
}

interface FnModules {
    assets?: string[];
    built: boolean;
    cacheable: boolean;
    chunks: Array<number | string>;
    depth?: number;
    errors: number;
    failed: boolean;
    filteredModules?: boolean;
    id: number | string;
    identifier: string;
    index: number;
    index2: number;
    issuer: string | undefined;
    issuerId: number | string | undefined;
    issuerName: string | undefined;
    issuerPath: Array<{
        id: number | string;
        identifier: string;
        name: string;
        profile: any; // TODO
    }>;
    modules: FnModules[];
    name: string;
    optimizationBailout?: string;
    optional: boolean;
    prefetched: boolean;
    profile: any; // TODO
    providedExports?: any; // TODO
    reasons: Reason[];
    size: number;
    source?: string;
    usedExports?: boolean;
    warnings: number;
}

export interface ToJsonOutput {
    _showErrors: boolean;
    _showWarnings: boolean;
    assets?: Array<{
        chunks: Array<number | string>;
        chunkNames: string[];
        emitted: boolean;
        isOverSizeLimit?: boolean;
        name: string;
        size: number;
    }>;
    assetsByChunkName?: Record<string, string | string[]>;
    builtAt?: number;
    children?: Array<ToJsonOutput & { name?: string }>;
    chunks?: Array<{
        children: number[];
        childrenByOrder: Record<string, number[]>;
        entry: boolean;
        files: string[];
        filteredModules?: number;
        hash?: string;
        id: number | string;
        initial: boolean;
        modules?: FnModules[];
        names: string[];
        origins?: Array<{
            moduleId?: string | number;
            module: string;
            moduleIdentifier: string;
            moduleName: string;
            loc: string;
            request: string;
            reasons: string[];
        }>;
        parents: number[];
        reason?: string;
        recorded?: boolean;
        rendered: boolean;
        size: number;
        siblings: number[];
    }>;
    entrypoints?: Record<string, ChunkGroup>;
    errors: Error[];
    env?: Record<string, any>;
    filteredAssets?: number;
    filteredModules?: boolean;
    hash?: string;
    modules?: FnModules[];
    namedChunkGroups?: Record<string, ChunkGroup>;
    needAdditionalPass?: boolean;
    outputPath?: string;
    publicPath?: string;
    time?: number;
    version?: string;
    warnings: string[];
}