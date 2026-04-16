import { MyError } from './error.js';

// BEGIN SHARED TYPE ApplicationServerRequest
export interface ApplicationServerRequest {
    // iso8601 request time
    time: string,
    userId: number,
    method: string,
    // GET api.example.com/appname/v1/something?param1=value1&param2=value2
    //                 this part: ^^^^^^^^^^^^^
    // GET api.example.com/appname/public/v1/something?param1=value1
    //                 this part: ^^^^^^^^^^^^^^^^^^^^
    path: string,
    query: string,
    body: any,
}
export interface ApplicationServerResponse {
    body?: any,
    error?: Error,
}
// END SHARED TYPE ApplicationServerRequest

// server side parameter validator
export class ParameterValidator {
    public constructor(private readonly parameters: URLSearchParams) {}

    private validate<T>(name: string, optional: boolean, convert: (raw: string) => T, validate: (value: T) => boolean): T {
        if (!this.parameters.has(name)) {
            if (optional) { return null; } else { throw new MyError('common', `missing required parameter ${name}`); }
        }
        const raw = this.parameters.get(name);
        const result = convert(raw);
        if (validate(result)) { return result; } else { throw new MyError('common', `invalid parameter ${name} value ${raw}`); }
    }

    public id(name: string) { return this.validate(name, false, parseInt, v => !isNaN(v) && v > 0); }
    public idopt(name: string) { return this.validate(name, true, parseInt, v => !isNaN(v) && v > 0); }
    public string(name: string) { return this.validate(name, false, v => v, v => !!v); }
}
