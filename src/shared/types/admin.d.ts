
export type AdminAuthCommand =
    | { type: 'reload-server', app: string }
    | { type: 'enable-signup' }
    | { type: 'disable-signup' }
    | { type: 'activate-user', userId: number }
    | { type: 'inactivate-user', userId: number }
    | { type: 'remove-device', deviceId: number };

export type AdminContentCommand =
    | { type: 'reload-static', key: string }
    | { type: 'reload-config' }
    | { type: 'enable-source-map' }
    | { type: 'disable-source-map' };

export type AdminCoreCommand =
    | { type: 'ping' }
    | { type: 'shutdown' }
    | { type: 'auth', sub: AdminAuthCommand }
    | { type: 'content', sub: AdminContentCommand };

export type AdminDevPageCommand =
    | 'reload-js'
    | 'reload-css';

export type AdminServiceCommand =
    | 'start'
    | 'stop'
    | 'restart'
    | 'is-active'
    | 'status';

export type AdminSelfHostCommand =
    | 'start'
    | 'stop';

export type AdminCommand =
    | { target: 'core', data: AdminCoreCommand }
    | { target: 'dev-page', data: AdminDevPageCommand }
    | { target: 'service', data: AdminServiceCommand }
    | { target: 'self-host', data: AdminSelfHostCommand };
