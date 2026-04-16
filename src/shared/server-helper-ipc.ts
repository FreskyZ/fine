// ATTENTION WORK IN PROGRESS
// // really in progress? actually separate process action server is not used in this movement, but future may still need this 

import syncfs from 'node:fs';
import net from 'node:net';
import dayjs from 'dayjs';
import { MyError } from './error.js';

export const dateFormat = 'YYYYMMDD';
export const timeFormat = 'YYYYMMDDHHmmdd';

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

export class ActionParameters {
    private readonly parameters: URLSearchParams;
    public constructor(query: string) { this.parameters = new URLSearchParams(query); }

    private validate<T>(name: string, optional: boolean, convert: (raw: string) => T, validate: (value: T) => boolean): T {
        if (!this.parameters.has(name)) {
            if (optional) { return null; } else { throw new MyError('common', `parameter ${name} missing`); }
        }
        const raw = this.parameters.get(name);
        const result = convert(raw);
        if (validate(result)) { return result; } else { throw new MyError('common', `parameter ${name} invalid value ${raw}`); }
    }

    public id(name: string) { return this.validate(name, false, parseInt, v => !isNaN(v) && v > 0); }
    public idopt(name: string) { return this.validate(name, true, parseInt, v => !isNaN(v) && v > 0); }
    public string(name: string) { return this.validate(name, false, v => v, v => !!v); }
    public number(name: string) { return this.validate(name, false, parseInt, v => !isNaN(v)); }
    public date(name: string) { return this.validate(name, false, v => dayjs(v, 'YYYYMMDD'), v => v.isValid()); }
    public datetime(name: string) { return this.validate(name, false, v => dayjs(v, 'YYYYMMDDHHmmdd'), v => v.isValid()); }
}

// TODO migrate to the same ParameterValidator like -hmr
export function validateNumber(name: string, raw: string): number {
    const result = parseInt(raw);
    if (isNaN(result)) {
        throw new MyError('common', `invalid parameter ${name} value ${raw}`);
    }
    return result;
}

export function validateId(name: string, raw: string): number {
    const result = parseInt(raw);
    if (isNaN(result) || result <= 0) {
        throw new MyError('common', `invalid parameter ${name} value ${raw}`);
    }
    return result;
}

export function validateDate(name: string, raw: string): dayjs.Dayjs {
    const result = dayjs(raw, dateFormat);
    if (!result.isValid()) {
        throw new MyError('common', `invalid parameter ${name} value ${raw}`);
    }
    return result;
}

export function validateTime(name: string, raw: string): dayjs.Dayjs {
    const result = dayjs(raw, timeFormat);
    if (!result.isValid()) {
        throw new MyError('common', `invalid parameter ${name} value ${raw}`);
    }
    return result;
}

export function validateBody<T>(body: any): T {
    if (!body || Object.keys(body).length == 0) {
        throw new MyError('common', 'invalid empty body');
    }
    return body;
}

let server: net.Server;
const connections: net.Socket[] = [];

interface ActionContext {
    time: string,
    userId: number,
}

export function setup(
    path: string,
    handleError: (kind: string, error: any) => any,
    // `${method} ${path}` => e.g. f(ax, v.id('xxid'), v.string('xxname'), body),
    // TODO is this enough?
    dispatchMap: Record<string, (ax: ActionContext, parameters: ActionParameters, body: any) => Promise<any>>,
) {
    server = net.createServer();
    server.on('error', error => {
        handleError('socket server', error);
    });
    server.on('connection', connection => {
        connections.push(connection);

        connection.on('close', () => {
            connections.splice(connections.indexOf(connection), 1);
        });
        connection.on('error', error => {
            handleError('socket connection', error);
        });
        connection.on('data', async data => {
            const payload = data.toString('utf-8');

            let request = {} as ApplicationServerRequest;
            try {
                request = JSON.parse(payload);
            } catch (error) {
                handleError('parse payload', error);
            }
            if (!request.method || !request.path) {
                handleError('parse payload', 'unknown structure');
            }
            const action = dispatchMap[`${request.method} ${request.path}`];

            let response: ApplicationServerResponse = {};
            if (!action) {
                response.error = new MyError('not-found', 'action not found');
                connection.write(JSON.stringify(response));
                return;
            }

            const ax: ActionContext = { time: request.time, userId: request.userId };
            const v = new ActionParameters(request.query);
            try {
                response = await action(ax, v, request.body);
            } catch (error) {
                handleError('dispatch', error);
                if (error instanceof MyError) {
                    response.error = error;
                } else {
                    response.error = new MyError('internal', error.message);
                }
            } finally {
                connection.write(JSON.stringify(response));
            }
        });
    });
    if (syncfs.existsSync(path)) {
        syncfs.unlinkSync(path);
    }
    server.listen(path);
}

export function setupAPIServer(
    path: string,
    // log input any: implementation to distinguish string or Error to log specifically
    // log output any: log may be async, but here does not care about waiting for log to complete
    onerror: (kind: string, error: any) => any,
    dispatch: (request: ApplicationServerRequest) => Promise<ApplicationServerResponse>,
) {
    server = net.createServer();
    server.on('error', error => {
        onerror('socket server', error);
    });
    server.on('connection', connection => {
        connections.push(connection);

        connection.on('close', () => {
            connections.splice(connections.indexOf(connection), 1);
        });
        connection.on('error', error => {
            onerror('socket connection', error);
        });
        connection.on('data', async data => {
            const payload = data.toString('utf-8');

            let request = {} as ApplicationServerRequest;
            try {
                request = JSON.parse(payload);
            } catch (error) {
                onerror('parse payload', error);
            }

            let response: ApplicationServerResponse = {};
            try {
                response = await dispatch(request);
            } catch (error) {
                onerror('dispatch', error);
                if (error instanceof MyError) {
                    response.error = error;
                } else {
                    response.error = new MyError('internal', error.message);
                }
            } finally {
                connection.write(JSON.stringify(response));
            }
        });
    });
    if (syncfs.existsSync(path)) {
        syncfs.unlinkSync(path);
    }
    server.listen(path);
}

export function shutdownAPIServer(onerror: (kind: string, error: any) => any): Promise<void> {
    for (const socket of connections) {
        socket.destroy();
    }
    return new Promise<void>((resolve, reject) => server.close(error => {
        if (error) { onerror('socket server close', error); reject(); }
        else { resolve(); }
    }));
}
