
// ATTENTION: after included by server-core and app-server, this code will be duplicated
// and server-core error handling will fail on `instanceof MyError`, so need to set Error.name to let server-core error handler recognize

export type MyErrorType = 'common' | 'not-found' | 'auth' | 'unreachable' | 'method-not-allowed';
export class MyError extends Error {
    constructor(public readonly type: MyErrorType, message?: string) {
        super(message);
        this.name = 'MyError';
    }
}
