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
    datetime: 'YYYY-MM-DD HH:mm:ss',
    date: 'YYYY-MM-DD',
};
