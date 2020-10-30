import * as mysql from 'mysql';
import config from '../config';

const connectionPool = mysql.createPool(config['mysql-connect']);

export interface ExecuteSqlResult {
    fields?: mysql.FieldInfo[];
    value: any,
}

export default class DataContext {
    private constructor(private connection: mysql.Connection) {
    }

    public static async create(): Promise<DataContext> {
        return await new Promise((res, rej) => connectionPool.getConnection(
            (err, connection) => err ? rej(err) : res(new DataContext(connection))));
    }

    public async executeSql(sql: string, ...params: any[]): Promise<ExecuteSqlResult> {
        return await new Promise((res, rej) => params.length == 0
            ? this.connection.query(sql, (err, value, fields) => err ? rej(err) : res({ value, fields }))
            : this.connection.query(sql, params, (err, value, fields) => err ? rej(err) : res({ value, fields })));
    }
}

