
import dayjs from 'dayjs';

// export function formatDatabaseDate(value: dayjs.Dayjs) {
//     return value.format('YYYY-MM-DD');
// }
// export function formatDatabaseDateTime(value: dayjs.Dayjs) {
//     return value.format('YYYY-MM-DD HH:mm:ss');
// }

// avoid millisecond part in Dayjs.toISOString()
// // this is not database directly related function but
// // but already 2 dayjs format function so put this here by the way
export function toISOString(value: dayjs.Dayjs) {
    return value.format('YYYY-MM-DDTHH:mm:ss[Z]');
}
