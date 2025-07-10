// admin interface types

export type AdminInterfaceCommand =
    | { kind: 'ping' }
    | { kind: 'shutdown' }
    | { kind: 'static-content:reload', key: string }
    | { kind: 'static-content:reload-config' }
    | { kind: 'short-link:reload' }
    | { kind: 'access-control:display-application-sessions' } // with new response-ful design, you can get
    | { kind: 'access-control:revoke', sessionId: number }
    | { kind: 'static-content:source-map:enable' }
    | { kind: 'static-content:source-map:disable' }
    | { kind: 'access-control:user:enable', userId: number }
    | { kind: 'access-control:user:disable', userId: number }
    | { kind: 'access-control:signup:enable' }
    | { kind: 'access-control:signup:disable' }
    | { kind: 'access-control:display-rate-limits' } // guess will be interesting
    | { kind: 'app:reload-domain' }
    | { kind: 'app:reload-server', name: string }
    | { kind: 'app:reload-client', name: string };

export interface AdminInterfaceResponse {
    ok: boolean,
    log: string,
    [p: string]: any,
}
