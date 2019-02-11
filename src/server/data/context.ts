import mysql from 'mysql';
import config from '../config';

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

class PhantomData{}
const phantom = new PhantomData();

//context.users.filter(user =>
//    [user.prop('Name'), 'eq', auth.username], 'and', [user.prop('Password'), 'eq', auth.password]

export class Expression{}

export class DataCollection<T> {
    /* private */ constructor(_phantom: PhantomData) {}

    public allColumns(): DataCollection<T> {
        return this;
    }
    public filter(): DataCollection<T> {
        return this;
    }

    // amazingly 'SELECT EXIST (SELECT FROM WHERE)' (or 'IQueryable.Any') is implicit send
    public exist(): Promise<boolean> {
        return Promise.resolve(true);
    }
    public sendQuery(): Promise<T[]> {
        return Promise.resolve([]);
    }
    public sendNoQuery(): Promise<void> {
        return Promise.resolve();
    }
    public sendScalar<U>(): Promise<U> {
        return Promise.resolve({} as unknown as U);
    }
}
export const users = new DataCollection<User>(phantom);

const connectionPool = mysql.createPool({
    ...config['mysql-connect'],
    connectionLimit: 6,
});

export interface ExecuteSqlResult {
    results: any,
    fields?: mysql.FieldInfo[],
}

export default class DataContext {

    private constructor(private connection: mysql.Connection) {
    }

    public static async create(): Promise<DataContext> {
        return await new Promise((res, rej) => connectionPool.getConnection(
            (err, connection) => err ? rej(err) : res(new DataContext(connection))));
    }

    public async executeSql(sql: string, ...values: string[]): Promise<ExecuteSqlResult> {
        return await new Promise((res, rej) => values.length == 0
            ? this.connection.query(sql, (err, results, fields) => err ? rej(err) : res({ results, fields }))
            : this.connection.query(sql, values, (err, results, fields) => err ? rej(err) : res({ results, fields })));
    }
}

