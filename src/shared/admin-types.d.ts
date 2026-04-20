
// admin interface types
//
// this is currently only shared by core module files from normal perspective (by ide find all references),
// this is placed here *was* because this *is* shared between core module and build script (remote akari),
// the definition is manually copied into remote-akari.ts beceause it is now not transpiled and bundled and
// directly copied into remote to run, and it will be complex to deploy and manage multiple files at remote
// side for one program, put one akari.ts beside index.js looks ok, but put several .ts and .d.ts beside it
// looks not good, the manual copy is auto checked in local akari commands to prevent potential differences
//
// although this file is technically only shared by core module,
// it is not placed in src/core/index.ts because I'd prefer not import from './' in submodules,
// and cannot find a submodule or worthy to create a new submodule to host the definition, so it is still here

// BEGIN SHARED TYPE AdminInterfaceCommand
export interface HasId {
    id: number,
}
export type AdminInterfaceCommand =
    | { kind: 'ping' }
    | { kind: 'shutdown' }
    | { kind: 'reload-certificate' }
    | { kind: 'static-content:reload', key: string }
    | { kind: 'static-content:reload-config' }
    | { kind: 'external-content:reload', name: string }
    | { kind: 'access-control:revoke', sessionId: number }
    | { kind: 'access-control:user:enable', userId: number }
    | { kind: 'access-control:user:disable', userId: number }
    | { kind: 'access-control:signup:enable' }
    | { kind: 'access-control:signup:disable' }
    | { kind: 'access-control:display-rate-limits' }
    | { kind: 'access-control:display-user-sessions' } // with new responseful design, you can get
    | { kind: 'access-control:display-application-sessions' } // with new responseful design, you can get
    | { kind: 'application-server:reload', name: string }
    | { kind: 'short-link-server:reload' };

export interface AdminInterfaceResult {
    status: 'unhandled' | 'ok' | 'error',
    logs: any[], // may include arbitrary objects
}
// END SHARED TYPE AdminInterfaceCommand
