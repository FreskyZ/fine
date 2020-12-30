
// this is payload from fpsd to server-core
export type AdminAuthData = 
    | { type: 'reload-server', app: string }
    | { type: 'enable-feature', featureName: string }
    | { type: 'disable-feature', featureName: string }
    | { type: 'enable-user', userId: number }
    | { type: 'disable-user', userId: number }
    | { type: 'expire-device', deviceId: number }

export type AdminContentData =
    | { type: 'reload-client', app: string }
    | { type: 'reload-page', pagename: string }
    | { type: 'enable-source-map' }
    | { type: 'disable-source-map' }
    | { type: 'set-websocket-port', port: number } // null to disbale

export type AdminPayload = 
    | { type: 'ping' }
    | { type: 'shutdown' } 
    | { type: 'auth', data: AdminAuthData }
    | { type: 'content', data: AdminContentData }
