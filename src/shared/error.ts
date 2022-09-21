
// ATTENTION: after included by core and app-server, this code will be duplicated
// and core error handling will fail on `instanceof MyError`, so need to set Error.name to let core error handler recognize

export type MyErrorType = 
    | 'common'
    | 'not-found'
    | 'auth'
    | 'unreachable'
    | 'method-not-allowed'
    | 'internal'
    | 'bad-gateway'
    | 'service-not-available'
    | 'gateway-timeout';

export class MyError extends Error {
    constructor(public readonly type: MyErrorType, message?: string) {
        super(message);
        this.name = 'MyError';
    }
}
