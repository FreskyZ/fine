// authentication shared types, used in core auth, user page and rpc library

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
