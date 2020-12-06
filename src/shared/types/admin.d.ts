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
}

export interface AdminEventEmitter extends EventEmitter {
    on(event: 'shutdown', listener: () => void): this;
    on(event: 'content-update', listener: (parameter: AdminContentUpdateParameter) => void): this;
    on(event: string, listener: Function): this;
}
