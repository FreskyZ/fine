// this file is not very adk, but if I don't include this in adk, I need to copy the content every time

import mysql from 'mysql2/promise';

let pool: mysql.Pool;
export function setupDatabaseConnection(config: mysql.PoolOptions) {
    pool = mysql.createPool({
        ...config,
        typeCast: (field, next) => {
            if (field.type == 'BIT' && field.length == 1) {
                return field.buffer()[0] == 1;
            }
            return next();
        },
    });
}

export const QueryDateTimeFormat = {
    datetime: 'YYYY-MM-DD HH:mm:ss',
    date: 'YYYY-MM-DD',
};

// query result except array of data
export interface QueryResult {
    insertId?: number,
    affectedRows?: number,
    changedRows?: number,
}

export { pool };

// promisify
export async function query<T extends mysql.QueryResult>(sql: string, ...params: any[]): Promise<{ fields: mysql.FieldPacket[], result: T }> {
    return await new Promise<{ fields: mysql.FieldPacket[], result: T }>((resolve, reject) => params.length == 0
        ? pool.query<T>(sql, (err, result, fields) => err ? reject(err) : resolve({ result, fields }))
        : pool.query<T>(sql, params, (err, result, fields) => err ? reject(err) : resolve({ result, fields })));
}
