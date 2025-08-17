
// admin interface types
//
// this is currently only shared by core module files from normal perspective (by find all references),
// this is placed here *was* because this *is* shared between core module and build script (remote akari),
// the definition is manually copied to remote-akari.ts because that is a direct invoked typescript at
// remote so it's complex and cubersome to include this type definition in webroot work folder,
// the manual copy is checked in deploy script `akari.ts self` to prevent potential human errors
//
// although this file is technically only shared by core module,
// it is not placed in src/core/index.ts because I'd prefer not import from './' in submodules,
// and cannot find a submodule or worthy to create a new submodule to host the definition, so it is still here

// // content server and api server are both application server,
// // to distinguish content server and api server, and make their name aligned,
// // api server is called action server, or actions server when need alignment,
// // this name comes from my naming convetion of write database model in "data-config.xml" and write api http endpoints in "data-action.xml",
// // the name of "action" is not too short and not too long and distinguishable comparing to "api", "interface", "endpoint", "function", "definition", etc.

// BEGIN SHARED TYPE AdminInterfaceCommand
export interface HasId {
    id: number,
}
export type AdminInterfaceCommand =
    | { kind: 'ping' }
    | { kind: 'shutdown' }
    | { kind: 'static-content:reload', key: string }
    | { kind: 'static-content:reload-config' }
    | { kind: 'access-control:revoke', sessionId: number }
    | { kind: 'access-control:user:enable', userId: number }
    | { kind: 'access-control:user:disable', userId: number }
    | { kind: 'access-control:signup:enable' }
    | { kind: 'access-control:signup:disable' }
    | { kind: 'access-control:display-rate-limits' }
    | { kind: 'access-control:display-user-sessions' } // with new responseful design, you can get
    | { kind: 'access-control:display-application-sessions' } // with new responseful design, you can get
    | { kind: 'content-server:reload', name: string }
    | { kind: 'actions-server:reload', name: string }
    | { kind: 'short-link-server:reload' };

export interface AdminInterfaceResult {
    status: 'unhandled' | 'ok' | 'error',
    logs: any[], // put object should be ok
}
// END SHARED TYPE AdminInterfaceCommand
