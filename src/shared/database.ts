
import dayjs from 'dayjs';
import pg from 'pg';

// query function need RowDataPacket, but this makes 
// the original type cannot be construct if use UserData extends RowDataPacket (missing required property),
// so use this helper generic type alias
export type QueryResult<T> = pg.QueryResult<T>;
// result of insert/update/delete, which is data Manipulatation language Result
export type ManipulateResult = pg.QueryResult;

export function formatDatabaseDate(value: dayjs.Dayjs) {
    return value.format('YYYY-MM-DD');
}
export function formatDatabaseDateTime(value: dayjs.Dayjs) {
    return value.format('YYYY-MM-DD HH:mm:ss');
}

// avoid millisecond part in Dayjs.toISOString()
// // this is not database directly related function but
// // but already 2 dayjs format function so put this here by the way
export function toISOString(value: dayjs.Dayjs) {
    return value.format('YYYY-MM-DDTHH:mm:ss[Z]');
}
