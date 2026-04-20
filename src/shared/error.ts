
export type MyErrorKind =
    | 'common'
    | 'not-found'
    | 'auth'
    | 'access-control'
    | 'unreachable'
    | 'rate-limit'
    | 'method-not-allowed'
    | 'internal'
    | 'bad-gateway'
    | 'service-not-available'
    | 'gateway-timeout';

// a common error type for all known errors
// - for core module and all external content providers and application servers
// - set .name because core module and each server are separate compilation units,
//   the class definitions are duplicated and cannot use instanceof to check known errors
export class MyError extends Error {
    // TODO review use of constructor parameter and distinguish between user message and internal log message
    constructor(
        public readonly kind: MyErrorKind,
        message?: string,
        public readonly additionalInfo?: string,
    ) {
        super(message);
        this.name = 'MyError';
    }
}
