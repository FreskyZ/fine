import * as mysql from 'mysql';

const pool = mysql.createPool({
    user: '<USER>',
    password: '<PASSWORD>',
    database: 'Home',
    supportBigNumbers: true,
    dateStrings: true,
});

export const QueryDateTimeFormat = {
    datetime: 'YYYY-MM-DD HH:mm:ss',
    date: 'YYYY-MM-DD',
}

// query result except array of data
export interface QueryResult {
    insertId?: number,
    affectedRows?: number,
    changedRows?: number,
}

// promisify
export async function query<T = any>(sql: string, ...params: any[]): Promise<{ fields: mysql.FieldInfo[], value: T }> {
    return await new Promise<{ fields: mysql.FieldInfo[], value: T }>((resolve, reject) => params.length == 0
        ? pool.query(sql, (err, value, fields) => err ? reject(err) : resolve({ value, fields }))
        : pool.query(sql, params, (err, value, fields) => err ? reject(err) : resolve({ value, fields })));
}
