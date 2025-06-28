import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import mysql from 'mysql2/promise';

// this file is not very adk, but if I don't include this in adk, I need to copy the content every time

export let pool: mysql.Pool;
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
    date: 'YYYY-MM-DD',
    datetime: 'YYYY-MM-DD HH:mm:ss',
};

// query function need RowDataPacket, but this makes 
// the original type cannot be construct if use UserData extends RowDataPacket (missing required property),
// so use this helper generic type alias
export type QueryResult<T> = T & RowDataPacket;
// result of insert/update/delete, which is data Manipulatation language Result
export type ManipulateResult = ResultSetHeader;
