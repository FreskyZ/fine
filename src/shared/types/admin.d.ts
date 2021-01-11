
export type AdminServerCoreAuthCommand =
    | { type: 'reload-server', app: string }
    | { type: 'enable-signup' }
    | { type: 'disable-signup' }
    | { type: 'activate-user', userId: number }
    | { type: 'inactivate-user', userId: number }
    | { type: 'remove-device', deviceId: number };

export type AdminServerCoreContentCommand =
    | { type: 'reload-client', app: string }
    | { type: 'reload-page', pagename: string }
    | { type: 'enable-source-map' }
    | { type: 'disable-source-map' };

export type AdminServerCoreCommand =
    | { type: 'ping' }
    | { type: 'shutdown' }
    | { type: 'auth', sub: AdminServerCoreAuthCommand }
    | { type: 'content', sub: AdminServerCoreContentCommand };

export type AdminWebPageCommand =
    | 'reload-js'
    | 'reload-css';

export type AdminServiceHostCommand =
    | 'start'
    | 'stop'
    | 'restart'
    | 'is-active'
    | 'status';

export type AdminSelfHostCommand =
    | 'start'
    | 'stop';

export type AdminPayload =
    | { target: 'server-core', data: AdminServerCoreCommand }
    | { target: 'web-page', data: AdminWebPageCommand }
    | { target: 'service-host', data: AdminServiceHostCommand }
    | { target: 'self-host', data: AdminSelfHostCommand };
