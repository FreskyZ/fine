// NOTE: partially copy from https://github.com/stacktracejs/stacktrace.js/blob/v2.0.0/stacktrace-js.d.ts
// because npm module 'stacktrace-js' does not include .d.ts in package, also the repo contains it

declare module 'stacktrace-js' {

    export interface SourceCache {
        [key: string]: string | Promise<string>;
    }

    export interface StackTraceOptions {
        filter?: (stackFrame: StackFrame) => boolean;
        sourceCache?: SourceCache;
        offline?: boolean;
    }

    export interface StackFrame {
        constructor(o: StackFrame): StackFrame;

        isConstructor?: boolean;
        isEval?: boolean;
        isNative?: boolean;
        isTopLevel?: boolean;
        columnNumber?: number;
        lineNumber?: number;
        fileName?: string;
        functionName?: string;
        source?: string;
        args?: any[];
        evalOrigin?: StackFrame;

        toString(): string;
    }

    export function fromError(error: Error, options?: StackTraceOptions): Promise<StackFrame[]>;
}
