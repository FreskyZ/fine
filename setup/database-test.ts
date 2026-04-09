import { Pool, types } from 'pg';
import dayjs from 'dayjs';

// test client library usages,
// also test custom build postgres server functionality

const pool = new Pool({
    host: '/run/pgsql',
    port: 6543,
    user: 'fine',
    database: 'fine',
    application_name: 'core', // application name is a column of csvlog
});

// case 1 connected
await (async () => {
    const result = await pool.query('SELECT $1::TEXT AS message', ['Hello world!']);
    console.log(result, JSON.stringify(result));
});

// case 2 query result type conversion
// - int get number, boolean get boolean, text get string, text array get array, timestamptz get iso8601 string
// - without settypeparser, date is Date, with settypeparser, date is dayjs
// - empty query result is empty array
await (async () => {
    // dayjs only defaults to parse iso8601 by the way
    types.setTypeParser(types.builtins.TIMESTAMPTZ, value => dayjs(value));
    const result = await pool.query('SELECT * FROM "user" WHERE "id" = 1;');
    console.log(JSON.stringify(result, undefined, 2));
    console.log(result.rows, result.fields);
    console.log(result.rows[0]['create_time'] instanceof Date, dayjs.isDayjs(result.rows[0]['create_time']));
});

// case 3 insert
// - result.rows is empty array, result.fields.is empty array
await (async () => {
    const accessToken = '012345678901234567890123456789012345678902'
    const result = await pool.query(
        'INSERT INTO "user_session" ("user_id", "name", ' +
            '"access_token", "last_access_time", "last_access_address") VALUES ($1, $2, $3, $4, $5)',
        [1, 'sessionname', accessToken, dayjs().toISOString(), '10.255.0.128'],
    );
    console.log(JSON.stringify(result, undefined, 2));
    console.log(result.rowCount);
});

// case 4
// - dummytoken += 'exceed length' => throw value to long for type
// - dummytoken.substring() => ok?, content successfully inserted
// - invalid date string => throw date/time field value out of range
// - invalid ip address => throw invalid input syntax for type inet: "dead:xyza::0"
// - valid non utc time => converted to utc
// - invalid fk => throw insert or update on table "user_session" violates foreign key constraint "user_session_user_id_fkey"
await (async () => {
    const dummyToken = '345678901234567890123456789012345678901234';
    const result = await pool.query(
        'INSERT INTO "user_session" ("user_id", "name", ' +
            '"access_token", "last_access_time", "last_access_address") VALUES ($1, $2, $3, $4, $5)',
        [101, 'sessionname4', dummyToken, '2025-05-05T23:01:01+8:00', '127.0.0.1'],
    );
    console.log(JSON.stringify(result, undefined, 2));
    console.log(result.rowCount);
});

// case 5, update
// - directly send dayjs object ok
// - update char(42) with shorter value ok
// - ipv4 compatible ipv6 address ok
await (async () => {
    types.setTypeParser(types.builtins.TIMESTAMPTZ, value => dayjs(value));
    const result = await pool.query('SELECT * FROM "user_session"');
    console.log(result.rows);
    const result1 = await pool.query(
        'UPDATE "user_session" SET "name" = $1, "access_token" = $2, "last_access_time" = $3, "last_access_address" = $4 WHERE "id" = 3',
        ['newname1', 'newaccesstoken1', (result.rows[1].last_access_time as dayjs.Dayjs).subtract(1, 'month'), '::ffff:1.2.3.4'],
    );
    console.log(JSON.stringify(result1, undefined, 2));
    console.log(result1.rowCount);
});

// case 6, where name
// - username: ok, UserName: no data, ILIKE: ok
await (async () => {
    const result = await pool.query('SELECT * FROM "user" WHERE "name" ILIKE $1', ['VISITOR1']);
    console.log(JSON.stringify(result, undefined, 2));
    console.log(result.rows);
});

// case 7: return insert id
await (async () => {
    const accessToken = '567890123456789012345678901234567890123456';
    const result = await pool.query(
        'INSERT INTO "user_session" ("user_id", "name", ' +
            '"access_token", "last_access_time", "last_access_address") VALUES ($1, $2, $3, $4, $5) RETURNING "id"',
        [1, 'sessionname7', accessToken, dayjs().toISOString(), '::1'],
    );
    console.log(JSON.stringify(result, undefined, 2));
    console.log(result.rows);
});

await pool.end();
