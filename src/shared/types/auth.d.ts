
export interface UserClaim {
    name: string,
    password: string,
}

export interface User {
    Id: number,
    Name: string,
    AuthenticatorToken: string,
    AccessToken: string,
    AccessTokenDate: string,
    RefreshToken: string,
    RefreshTokenTime: string,
}

export interface UserCredential {
    id: number;
    name: string;
}
