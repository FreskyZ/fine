
export type MyErrorType = 'common' | 'auth' | 'unreachable' | 'method-not-allowed';
export class MyError extends Error {
    constructor(public readonly type: MyErrorType, message?: string) {
        super(message);
    }
}
