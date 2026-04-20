// ATTENTION WORK IN PROGRESS
// // really in progress? actually ipc application server is not used in this movement, but future may still need this 

import npfs from 'node:fs';
import net from 'node:net';
import dayjs from 'dayjs';
import { MyError } from './error.js';
import type { ApplicationServerRequest, ApplicationServerResponse } from './server-types.js';

export interface ActionContext {
    time: dayjs.Dayjs,
    userId: number,
}
// the received request object have to be plain, wrap it with a helper class for easy access
export class RequestContext {

    private readonly request: ApplicationServerRequest;
    private readonly parameters: URLSearchParams;
    public constructor(request: ApplicationServerRequest) {
        this.request = request;
        this.parameters = new URLSearchParams(request.query);
    }

    public get ax(): ActionContext {
        return { time: dayjs.utc(this.request.time), userId: this.request.userId };
    }
    public get body(): any {
        if (!this.request.body) { throw new MyError('common', 'invalid empty body'); }
        return this.request.body;
    }

    private validate<T>(name: string, optional: boolean, convert: (raw: string) => T, validate: (value: T) => boolean): T {
        if (!this.parameters.has(name)) {
            if (optional) { return null; } else { throw new MyError('common', `parameter ${name} missing`); }
        }
        const raw = this.parameters.get(name);
        const result = convert(raw);
        if (validate(result)) { return result; } else { throw new MyError('common', `parameter ${name} invalid value ${raw}`); }
    }
    public id(name: string) {
        return this.validate(name, false, parseInt, v => !isNaN(v) && v > 0);
    }
    public idopt(name: string) {
        return this.validate(name, true, parseInt, v => !isNaN(v) && v > 0);
    }
    public string(name: string) {
        return this.validate(name, false, v => v, v => !!v);
    }
    public number(name: string) {
        return this.validate(name, false, parseInt, v => !isNaN(v));
    }
    public date(name: string) {
        return this.validate(name, false, v => dayjs.utc(v, 'YYYYMMDD'), v => v.isValid());
    }
    public datetime(name: string) {
        return this.validate(name, false, v => dayjs.utc(v, 'YYYYMMDDHHmmdd'), v => v.isValid());
    }
}

export class ApplicationServer {
    public constructor(
        private readonly server: net.Server,
        private readonly connections: net.Socket[],
        private readonly handleError: (kind: string, error: any) => any,
    ) {}
    public close() {
        for (const socket of this.connections) {
            socket.destroy();
        }
        return new Promise<void>((resolve, reject) => this.server.close(error => {
            if (error) { this.handleError('socket server close', error); reject(); }
            else { resolve(); }
        }));
    }
}
export function listen(
    socketpath: string,
    actionmap: Record<string, (request: RequestContext) => Promise<any>>,
    options: {  
        handleError?: (kind: string, error: any) => any,
    },
) {
    const server = net.createServer();
    const connections: net.Socket[] = [];
    const handleError = typeof options.handleError == 'function' ? options.handleError : () => {};

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
            // TODO need to handle packet fragmentation
            const payload = data.toString('utf-8');
            const sendResponse = (response: any) => connection.write(JSON.stringify(response));

            let request = {} as ApplicationServerRequest;
            try {
                request = JSON.parse(payload);
            } catch (error) {
                handleError('parse payload', error);
                return sendResponse({ error: new MyError('bad-gateway', null, 'invalid packet?') });
            }
            if (!request.method || !request.path) {
                handleError('parse payload', 'unknown structure');
                return sendResponse({ error: new MyError('bad-gateway', null, 'unknown packet structure?') });
            }

            const actionkey = `${request.method} ${request.path}`;
            if (!(actionkey in actionmap)) {
                return sendResponse({ error: new MyError('not-found', 'action not found') });
            }

            try {
                sendResponse({ body: await actionmap[actionkey](new RequestContext(request)) });
            } catch (error) {
                handleError('dispatch', error);
                if (error instanceof MyError) {
                    sendResponse({ error });
                } else {
                    sendResponse({ error: new MyError('internal', error.message) });
                }
            }
        });
    });

    if (npfs.existsSync(socketpath)) { npfs.unlinkSync(socketpath); }
    return new Promise<ApplicationServer>(resolve => server.listen(socketpath, () => {
        resolve(new ApplicationServer(server, connections, handleError));
    }));
}
