
export interface UserClaim {
    name: string,
    password: string,
}

export interface DUser {
    Id: number,
    Name: string,
    AuthenticatorToken: string,
    AccessToken: string,
    AccessTokenDate: string,
    RefreshToken: string,
    RefreshTokenTime: string,
}