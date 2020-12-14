import { EventEmitter } from 'events';

export type AdminPayload = {
    type: 'shutdown'
} | {
    type: 'reload-static', // js/css/html
    key: string,           // www | loging | app names
} | {
    type: 'reload-server', // app/server.js
    app: string,           // app names
} | {
    type: 'expire-device',
    deviceId: number,
}

export interface AdminEventEmitter extends EventEmitter {
    on(event: 'shutdown', listener: () => void): this;
    on(event: 'expire-device', listener: (deviceId: number) => void): this;
    on(event: 'reload-static', listener: (key: string) => void): this;
    on(event: 'reload-server', listener: (app: string) => void): this;
    on(event: string, listener: Function): this;
}
