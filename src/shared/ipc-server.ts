// ATTENTION WORK IN PROGRESS
// // really in progress? actually separate process action server is not used in this movement, but future may still need this 

import syncfs from 'node:fs';
import net from 'node:net';
import dayjs from 'dayjs';
import { MyError } from './error.js';
import { UserCredential } from './access-types.js';

export const dateFormat = 'YYYYMMDD';
export const timeFormat = 'YYYYMMDDHHmmdd';

export interface RequestState {
    user: UserCredential,
}

export interface ActionServerContext {
    method: string,
    // GET api.domain.com/app1/v1/getsomething
    //           this part:   ^^^^^^^^^^^^^^^^
    path: string,
    body: any,
    state: RequestState,
    status?: number,
    error?: MyError,
}

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

export function setupAPIServer(
    path: string,
    // log input any: implementation to distinguish string or Error to log specifically
    // log output any: log may be async, but here does not care about waiting for log to complete
    onerror: (kind: string, error: any) => any,
    dispatch: (ctx: ActionServerContext) => Promise<void>,
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

            let ctx = {} as ActionServerContext;
            try {
                ctx = JSON.parse(payload);
            } catch (error) {
                onerror('parse payload', error);
            }

            try {
                await dispatch(ctx);
            } catch (error) {
                onerror('dispatch', error);
                if (error instanceof MyError) {
                    ctx.error = error;
                } else {
                    ctx.error = new MyError('internal', error.message);
                }
            } finally {
                delete ctx.path;
                delete ctx.state;
                delete ctx.method;
                connection.write(JSON.stringify(ctx));
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
