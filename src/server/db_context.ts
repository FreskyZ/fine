
export namespace DB {

    export interface User {
        Id: number;
        LoginId: string;
        Name: string;
        Password: string;
        Token: string;
        TokenCreateTime: Date;
        CreateBy: string;
        CreateTime: Date;
        UpdateBy: string;
        UpdateTime: Date;
    }
}

export class DbSet {
}

export default class DbContext {

}

