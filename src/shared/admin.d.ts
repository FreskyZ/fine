// admin interface types

export type AdminAccessCommand =
    | { type: 'enable-signup' }
    | { type: 'disable-signup' }
    | { type: 'activate-user', userId: number }
    | { type: 'inactivate-user', userId: number }
    | { type: 'revoke-session', sessionId: number };

export type AdminContentCommand =
    | { type: 'reload-static', key: string }
    | { type: 'reload-config' }
    | { type: 'reset-short-link' }
    | { type: 'enable-source-map' }
    | { type: 'disable-source-map' };

export type AdminForwardCommand =
    | { type: 'reload-app', name: string }

export type AdminCoreCommand =
    | { type: 'ping' }
    | { type: 'shutdown' }
    | { type: 'access', sub: AdminAccessCommand }
    | { type: 'content', sub: AdminContentCommand }
    | { type: 'forward', sub: AdminForwardCommand };

export type AdminDevPageCommand =
    | 'reload-all'
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
