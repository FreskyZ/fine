import type * as koa from 'koa';
import { MyError } from '../shared/error.js';
import { log } from './logger.js';

// this module contains request and process unexpected error handlers

const ErrorCodes: { [errorType in MyError['kind']]: number } = {
    'common': 400,
    'auth': 401,
    'not-found': 404,
    'method-not-allowed': 405,
    'rate-limit': 429,
    'unreachable': 500,
    'internal': 500,
    'bad-gateway': 502,
    'service-not-available': 503,
    'gateway-timeout': 504,
};

// the major error wrapper in middleware workflow
export async function handleRequestError(ctx: koa.Context, next: koa.Next): Promise<void> {
    try {
        await next();
    } catch (error) {
        const request = `${ctx.method} ${ctx.host}${ctx.url}`;
        // servers have duplicate class definition or is cross process, cannot use instanceof and need to use .name
        if (error instanceof MyError || error.name == 'MyError') {
            const myerror = error as MyError;
            const message
                = myerror.kind == 'unreachable' ? 'unreachable code reached'
                : myerror.kind == 'method-not-allowed' ? 'method not allowed'
                : myerror.kind == 'service-not-available' ? 'service not available'
                : myerror.kind == 'auth' ? 'authentication failed' : myerror.message;
            ctx.status = ErrorCodes[myerror.kind];
            ctx.body = { message };
            log.error({ type: myerror.kind, request,
                state: ctx.state ? JSON.stringify(ctx.state) : undefined, error: message, additional: error.additionalInfo });
        } else {
            ctx.status = 500;
            const message = error instanceof Error ? error.message : Symbol.toStringTag in error ? error.toString() : 'error';
            log.error({ type: 'request handling unexpected error', request, error: message, stack: error.stack });
            console.log(`${request}: ${message}`);
        }
    }
}

// log and abort for all uncaught exceptions
export function handleProcessException(error: Error) {

    // hardcode exclude some special cases
    if (error.message == 'read ECONNRESET') {
        // ignore read connection reset beceause it does not corrupt state while it seems to be not catchable by on('error')
        log.error({ type: 'uncaught read connection reset', error });
        return;
    } else if (error.message.includes('deps/openssl/openssl')) {
        // ignore openssl error because I guess it does not corrupt state while it seems to be not catchable by on('error')
        log.error({ type: 'openssl error, I guess', error });
        return;
    }

    log.error({ type: 'uncaught exception', error });
    console.log(`uncaught exception: ${error.message}`);
    process.exit(103);
}

// log and abort for all unhandled rejections
export function handleProcessRejection(reason: any) {
    const message = reason instanceof Error ? reason.message : Symbol.toStringTag in reason ? reason.toString() : reason;

    log.error({ type: 'unhandled rejection', message });
    console.log(`unhandled rejection: ${message}: `);
    process.exit(104);
}
