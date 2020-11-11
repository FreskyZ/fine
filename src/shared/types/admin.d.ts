import { EventEmitter } from 'events';

export interface AdminReloadParameter {
    type: 'index' | 'static',
    name: string, // subdomain name or file name
}

export type AdminSocketPayload = {
    type: 'shutdown'
} | {
    type: 'reload',
    parameter: AdminReloadParameter
}

export interface AdminEventEmitter extends EventEmitter {
    on(event: 'shutdown', listener: () => void): this;
    on(event: 'reload', listener: (parameter: AdminReloadParameter) => void): this;
    on(event: string, listener: Function): this;
}
