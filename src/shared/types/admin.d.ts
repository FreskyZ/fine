
export type AdminAuthCommand =
    | { type: 'reload-server', app: string }
    | { type: 'enable-signup' }
    | { type: 'disable-signup' }
    | { type: 'enable-user', userId: number }
    | { type: 'disable-user', userId: number }
    | { type: 'expire-device', deviceId: number };

export type AdminContentCommand =
    | { type: 'reload-client', app: string }
    | { type: 'reload-page', pagename: string }
    | { type: 'enable-source-map' }
    | { type: 'disable-source-map' };

export type AdminWebPageCommand =
    | 'reload-js'
    | 'reload-css';

export type AdminServiceCommand =
    | 'start'
    | 'stop'
    | 'restart'
    | 'is-active'
    | 'status';

export type AdminWatchServerCoreCommand =
    | 'start'
    | 'stop';

export type AdminPayload =
    | { type: 'ping' }                                       // this send to server core
    | { type: 'shutdown' }                                   // this send to server core
    | { type: 'auth', data: AdminAuthCommand }               // this send to server core auth
    | { type: 'content', data: AdminContentCommand }         // this send to server core content
    | { type: 'service', data: AdminServiceCommand }         // this send to systemctl
    | { type: 'webpage', data: AdminWebPageCommand }         // this send to browser opened tab
    | { type: 'watchsc', data: AdminWatchServerCoreCommand };// watch-server-core, this send to hosted srever core
