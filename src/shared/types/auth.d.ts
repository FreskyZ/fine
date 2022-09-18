// in this file XXXData means database model

export interface UserData {
    Id: number,
    Name: string,
    Active: boolean,
    Token: string,
}
export interface UserDeviceData {
    Id: number,
    App: string,
    Name: string,
    Token: string,
    UserId: number,
    LastAccessTime: string,
    LastAccessAddress: string,
}

export interface UserClaim {
    username: string,
    password: string,
}

// NOTE: sync with shared/api-server.ts
export interface UserCredential {
    id: number,
    name: string,
    deviceId: number,
    deviceName: string,
}

export interface UserDevice {
    id: number,
    name: string,
    lastTime: string,
    lastAddress: string,
}
