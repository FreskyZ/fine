import * as mysql from 'mysql';

const pool = mysql.createPool({
    user: '<USER>',
    password: '<PASSWORD>',
    database: 'Home',
    supportBigNumbers: true,
    dateStrings: true,
});

// promisify
export class DatabaseConnection {
    private constructor(private _inner: mysql.Connection) {
    }
    public static async create(): Promise<DatabaseConnection> {
        return await new Promise((resolve, reject) => pool.getConnection(
            (error, connection) => error ? reject(error) : resolve(new DatabaseConnection(connection))));
    }
    public async query(sql: string, ...params: any[]): Promise<{ fields: mysql.FieldInfo[], value: any }> {
        return await new Promise((resolve, reject) => params.length == 0
            ? this._inner.query(sql, (err, value, fields) => err ? reject(err) : resolve({ value, fields }))
            : this._inner.query(sql, params, (err, value, fields) => err ? reject(err) : resolve({ value, fields })));
    }
}
