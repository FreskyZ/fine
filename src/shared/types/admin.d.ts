import { EventEmitter } from 'events';

export interface AdminContentUpdateParameter {
    app: string,  // 'www' | appname
    name: string, // e.g. index.html, index.js.map
}

export type AdminSocketPayload = {
    type: 'shutdown'
} | {
    type: 'content-update',
    parameter: AdminContentUpdateParameter,
} | {
    type: 'reload-app-server'
    app: string,
}

export interface AdminEventEmitter extends EventEmitter {
    on(event: 'shutdown', listener: () => void): this;
    on(event: 'content-update', listener: (parameter: AdminContentUpdateParameter) => void): this;
    on(event: 'reload-app-server', listener: (app: string) => void): this;
    on(event: string, listener: Function): this;
}
