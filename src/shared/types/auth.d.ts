// in this file XXXData means database model

export interface UserData {
    Id: number,
    Name: string,
    Token: string,
}
export interface UserDeviceData {
    Id: number,
    App: string,
    Name: string,
    Token: string,
    UserId: number,
    LastAccessTime: string,
    // CreateClientIp is create only and will not be selected from db
}

export interface UserClaim {
    username: string,
    password: string,
}
export interface UserCredential {
    id: number;
    name: string;
    deviceId: number,
    deviceName: string,
}
