
// this is payload from fpsd to server-core
export type AdminAuthCommand = 
    | { type: 'reload-server', app: string }
    | { type: 'enable-signup' }
    | { type: 'disable-signup' }
    | { type: 'enable-user', userId: number }
    | { type: 'disable-user', userId: number }
    | { type: 'expire-device', deviceId: number }

export type AdminContentCommand =
    | { type: 'reload-client', app: string }
    | { type: 'reload-page', pagename: string }
    | { type: 'enable-source-map' }
    | { type: 'disable-source-map' }
    | { type: 'set-websocket-port', port: number } // null to disbale

export type AdminWebPageCommand = 
    | { type: 'reload-js' }
    | { type: 'reload-css' }

export type AdminPayload = 
    | { type: 'ping' }
    | { type: 'shutdown' } 
    | { type: 'webpage', data: AdminWebPageCommand }
    | { type: 'auth', data: AdminAuthCommand }
    | { type: 'content', data: AdminContentCommand }
