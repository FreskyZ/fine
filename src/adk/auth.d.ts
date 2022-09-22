// types used in special auth api, see docs/authentication.md
// currently only one type is shared by core module and user page, but I still don't want to write them twice
// while put in src/core makes the directory don't look beautiful (because of the simplicity), so put it here,
// more types may be put here if special auth api added or changed to return more complex types

export interface UserDevice {
    id: number,
    name: string,
    lastTime: string,
    lastAddress: string,
}

export interface UserCredential {
    id: number,
    name: string,
    deviceId: number,
    deviceName: string,
}
