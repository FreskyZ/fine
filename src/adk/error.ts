// share error kind to prevent duplication,
// also for src/core/error.ts, use error.name == 'FineError' because
//   'instanceof MyError' cannot pass through core-app's plain text border (prototype is not same instance)

export type FineErrorKind =
    | 'common'
    | 'not-found'
    | 'auth'
    | 'unreachable'
    | 'method-not-allowed'
    | 'internal'
    | 'bad-gateway'
    | 'service-not-available'
    | 'gateway-timeout';

// also this cannot extend Error because that make error.message and
// error.name not FineError's owned property and will not be JSON stringified
export class FineError {
    public readonly name: string;
    public constructor(public readonly kind: FineErrorKind, public readonly message?: string) {
        this.name = 'FineError';
    }
}
