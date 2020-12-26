import { EventEmitter } from 'events';

export type AdminPayload = {
    type: 'shutdown'
} | {
    type: 'reload-static',  // js/css/html
    key: string,            // www | loging | app names
} | {
    type: 'config-devmod',  // mode is abbreviated mod to make name aligned
    sourceMap?: boolean,    // undefined to keep old
    websocketPort?: number, // undefined to keep old
} | {
    type: 'reload-server',  // app/server.js
    app: string,            // app names
} | {
    type: 'expire-device',
    deviceId: number,
}

export interface AdminEventEmitter extends EventEmitter {
    on(event: 'shutdown', listener: () => void): this;
    on(event: 'expire-device', listener: (deviceId: number) => void): this;
    on(event: 'reload-static', listener: (key: string) => void): this;
    on(event: 'config-devmod', listener: (sourceMapEnabled: boolean, websocketPort: number) => void): this;
    on(event: 'reload-server', listener: (app: string) => void): this;
    on(event: string, listener: Function): this;
}
