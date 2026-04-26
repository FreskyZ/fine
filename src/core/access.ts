import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import dayjs from 'dayjs';
import koa from 'koa';
import pg from 'pg';
import * as otplib from 'otplib';
import { crypto as OtplibCryptoPlugin } from '@otplib/plugin-crypto-node';
import qrcode from 'qrcode';
import yaml from 'yaml';
import type { UserCredential, UserSession } from '../shared/access-types.js';
import type { AdminInterfaceCommand, AdminInterfaceResult } from '../shared/admin-types.js';
import { MyError } from '../shared/error.js';
import { RateLimit } from '../shared/ratelimit.js';
// import { log } from './logger.js'; // you don't use log in this file?

// access control, include authentication and some authorization
// include authentication sign in, sign out, sign up, user info, etc. related actions
// also see docs/authentication.md

interface ContextState {
    // try use same request time
    time: dayjs.Dayjs,
    // user and session info, or is public api
    userId: number,
    sessionId: number,
    annonymous: boolean,
    // result for basic authorization (whether user can access this app)
    appconfig: ApplicationConfig,
}
// my access control context, abbreviated mycontext
export type MyContext = koa.ParameterizedContext<ContextState>;

interface ApplicationConfig {
    name: string,
    host: string,
    module?: string,
    socket?: string,
}
const allApplications: ApplicationConfig[] = [];

interface AccessControlConfig {
    database: pg.PoolConfig,
    applications: Record<string, {
        // value may be
        // - app.example.com, this service is hosted on app.example.com/{appname}
        // - othersubdomain.example.com, this service is hosted on this subdomain,
        //   ATTENTION subdomain may not be same as app name
        host: string,
        // nodejs module path for hmr server...
        module?: string,
        // or socket file path for ipc server
        socket?: string,
    }>,
}
export const accessControlConfigPath = path.resolve(process.env['FINE_CONFIG_DIR'] ?? '', 'access.yml');
export async function setupAccessControl() {
    const config = yaml.parse(await fs.readFile(accessControlConfigPath, 'utf-8')) as AccessControlConfig;

    pool = new pg.Pool(config.database);
    pg.types.setTypeParser(pg.types.builtins.TIMESTAMPTZ, value => dayjs(value));

    allApplications.push(...Object.entries(config.applications ?? {}).map(([name, config]) => ({
        name,
        host: config.host,
        module: config.module,
        socket: config.socket,
    })));
    ratelimits.apps = Object.fromEntries(allApplications.map(a => [a.name, new RateLimit('access-control:apps', 10, 1)]));
    // fullamount=2: generate-authorization-code and application's signin are both using this, if 1 then /signin will fail
    ratelimits.appSignIn = Object.fromEntries(allApplications.map(a => [a.name, new RateLimit('access-control:app-signin', 2, 1)]));
}

// rate limit various aspects
const ratelimits = {
    // this limits all (over all ip and app),
    // when requesting a token, key is empty string
    all: new RateLimit('access-control:all', 100, 1),
    // api invocation per app then per ip, this use (10, 1)
    apps: {} as Record<string, RateLimit>,
    // specifically limit sign in operation, per ip
    idSignIn: new RateLimit('access-control:id-signin', 1, 1),
    // per app per ip, this use (1, 1)
    // generate authorization code and application sign in use the same limit
    appSignIn: {} as Record<string, RateLimit>,
};
setInterval(() => {
    // ratelimits.all.cleanup(); // all does not use key
    Object.values(ratelimits.apps).map(r => r.cleanup());
    ratelimits.idSignIn.cleanup();
    Object.values(ratelimits.appSignIn).map(r => r.cleanup());
}, 3600_000);

// all request here is cross origin because api.example.com does not have ui
// this is before authentication and don't know the user, although app is known here, cannot authorize user to access app
export async function handleRequestCrossOrigin(ctx: MyContext, next: koa.Next): Promise<void> {
    if (ctx.subdomains[0] != 'api') { throw new MyError('unreachable'); }

    // validate origin and assign ctx.state.app
    if (ctx.origin == 'https://id.example.com') {
        ctx.state.appconfig = { name: 'id' } as ApplicationConfig; // use id (identity provider) for id.example.com
    } else if (ctx.origin == 'https://app.example.com') {
        const referrer = ctx.get('Referer');
        // - cannot validate against request path when requesting /user-credentials and /signin, referrer seems work
        // - normal request (referrer-policy: strict-origin-when-cross-origin)
        //   also have this beginning part in referer, need to be exactly longer than that
        // - don't forget don't count this example.com string length,
        //   that will be replaced at build time, amazingly terser will optimize that to be constant number
        let appname: string;
        if (referrer && referrer.startsWith('https://app.example.com/') && referrer.length > 'https://app.example.com/'.length) {
            appname = new URL(referrer).pathname.substring(1).split('/')[0].trim();
        } else {
            appname = ctx.path.substring(1).split('/')[0].trim();
        }
        ctx.state.appconfig = allApplications.find(a => a.name == appname && a.host == 'app.example.com');
        // direct return and do not set access-control-* and let browser reject it
        if (!ctx.state.appconfig) { return; }
    } else {
        ctx.state.appconfig = allApplications.find(a => ctx.origin == `https://${a.host}`);
        // direct return and do not set access-control-* and let browser reject it
        if (!ctx.state.appconfig) { return; }
    }

    ctx.vary('Origin');
    ctx.set('Access-Control-Allow-Origin', ctx.origin);
    ctx.set('Access-Control-Allow-Methods', 'GET,HEAD,POST,PUT,DELETE,PATCH');
    ctx.set('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    // my token lasts for 30 days, but preflight request max age is capped at 2 hours in chromium,
    // https://github.com/chromium/chromium/blob/16d2d3f596a96a70bf1dfc2766ba33fbd042d121/services/network/cors/preflight_result.cc#L38
    // so use a simple 1 hour, although I can expire a user session at any time as I wish, I actually never used the feature and should be ok
    ctx.set('Access-Control-Max-Age', '3600');
    if (ctx.method == 'OPTIONS') { ctx.status = 200; return; } // handling of OPTIONS is finished here

    // api result should not cache
    // Pragma: no-cache is not specified for response and is deprecated, https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Pragma
    // Expires: has lower priority to cache-control:max-age, https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Expires
    // Surrogate-Control: is for surrogate, such as CDN or reverse proxy, https://www.w3.org/TR/edge-arch/
    // Cache-Control:
    //   https://www.rfc-editor.org/rfc/rfc9111.html#name-cache-control
    //   https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control
    //   no-cache: allow cache, always revalidate before using cache   // maybe better named always-revalidate
    //   max-age=0: response become stale immediately when received    // maybe better named always-stale
    //   no-store: the actual not cache anything                       // this name is kind of correct
    //   must-revalidate: always revalidate when response become stale // maybe better named must-revalidate-when-stale
    // so no-cache is theoretically same as max-age:0 + must-revalidate
    // but, api response does not specify any etag or last-modified tag, so there is literal nothing to revalidate
    // // standard says response must not be stored in non volatile storage and
    // // must tries best to remove from volatile storage so some people think it affects performance,
    // // but I think modern browser will not respect the second part, at least I always want to see it in devtool
    ctx.set('Cache-Control', 'no-store');

    await next();
}

// db types are postfixed 'Data' compared to non postfixed api types
interface UserData {
    id: number,
    name: string,
    active: boolean,
    secret: string,
    apps: string[],
}
interface UserSessionData {
    id: number,
    user_id: number,
    name: string,
    access_token: string,
    last_access_time: dayjs.Dayjs,
    last_access_address: string,
}
// database connection pool
let pool: pg.Pool;
// cache database data, entries will not expire,
// no need to update from or sync with database because I'm not likely to directly update db table
const userStorage: UserData[] = [];
const userSessionStorage: UserSessionData[] = [];

// in memory application authorization code and access token storage
// they have very short lifetime and no need to save to database and consider server restart
interface AuthorizationCodeData {
    userId: number,    // check user inactive when sign in
    sessionId: number, // check session revoke when sign in
    appname: string,   // check app match when sign in
    value: string,
    expireTime: dayjs.Dayjs,
}
interface ApplicationSessionData {
    userId: number,    // check user inactive when authenticate
    sessionId: number, // this is UserSession.Id database column value, not id of this data, check session revoke when authenticate
    appname: string,   // check app match when authenticate
    accessToken: string,
    lastAccessTime: dayjs.Dayjs,
}
const authorizationCodeStorage: AuthorizationCodeData[] = [];
const applicationSessionStorage: ApplicationSessionData[] = [];
setInterval(() => {
    const validAuthorizationCodes = authorizationCodeStorage.filter(c => dayjs.utc().isBefore(c.expireTime));
    authorizationCodeStorage.splice(0, authorizationCodeStorage.length);
    validAuthorizationCodes.forEach(c => authorizationCodeStorage.push(c));
    const validApplicationAccessTokens = applicationSessionStorage.filter(c => dayjs.utc().isBefore(c.lastAccessTime.add(1, 'hour')));
    applicationSessionStorage.splice(0, applicationSessionStorage.length);
    validApplicationAccessTokens.forEach(c => applicationSessionStorage.push(c));
}, 3600_000).unref();

// ignore case comparator
const collator = Intl.Collator('en', { sensitivity: 'base' });

// similar to some other features, sign up is timeout disabled after 12 hours if not manually disabled or reenabled
let AllowSignUp = false;
let AllowSignUpTimer: NodeJS.Timeout;

// generate random text in length
function generateRandomText(length: number) {
    return crypto.randomBytes(Math.ceil(length * 3 / 4)).toString('base64').slice(0, length);
}

// for sign in and sign up, authorization header is basic + base64 encoded colon separated values
// return empty array for invalid value, which should be convenient to directly deconstruct into array elements
function getBasicAuthorization(ctx: MyContext) {
    const raw = ctx.get('authorization');
    if (!raw) { return []; }
    if (!raw.startsWith('Basic ')) { return []; }
    // this will be very high if you don't inline everything
    let decoded: string; try { decoded = atob(raw.substring(6)); } catch { return []; }
    return decoded.split(':').map(v => v.trim()).filter(v => v);
}
// get normal bearer access token from request header
function getBearerAuthorization(ctx: MyContext) {
    const raw = ctx.get('authorization');
    if (!raw) { throw new MyError('auth', undefined, 'missing authorization header'); }
    if (!raw.startsWith('Bearer ')) { throw new MyError('auth', undefined, 'invalid authorization header'); }

    const accessToken = raw.substring(7);
    if (!accessToken) { throw new MyError('auth', undefined, 'invalid access token'); }
    return accessToken;
}

// and save to cache
async function getUserById(userId: number) {
    let user = userStorage.find(u => u.id == userId);
    if (!user) {
        const queryResult = await pool.query<UserData>(
            'SELECT "id", "name", "active", "secret", "apps" FROM "user" WHERE "id" = $1', [userId]);
        user = queryResult.rows[0];
        // check again, because task schedule may happen cross await point
        if (!userStorage.some(u => u.id == userId)) {
            userStorage.push(user);
        }
    }
    return user;
}

// for signin and signup, return access token
async function createUserSession(ctx: MyContext, userId: number): Promise<{ accessToken: string }> {
    // NOTE: 42 is a arbitray number, because this is random token, not encoded something token
    const accessToken = generateRandomText(42);
    const session: UserSessionData = {
        id: 0,
        user_id: userId,
        name: '<unnamed>',
        access_token: accessToken,
        last_access_time: ctx.state.time,
        last_access_address: ctx.socket.remoteAddress,
    };
    const insertResult = await pool.query<{ id: number }>(
        'INSERT INTO "user_session" ("user_id", "name", "access_token",'
        + ' "last_access_time", "last_access_address") VALUES ($1, $2, $3, $4, $5) RETURNING "id"',
        [session.user_id, session.name, session.access_token, ctx.state.time, session.last_access_address]);
    session.id = insertResult.rows[0].id;
    userSessionStorage.push(session);

    return { accessToken };
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';
// before/after: before/after authenticate
type SpecialActionKind = 'id-before' | 'id-after' | 'app-before' | 'app-after';
// use regex to dispatch special apis
// // this makes the usage looks like c# property/java annotation/python annotation/typescript metadata
type SpecialAction = [
    { kind: SpecialActionKind, method: Method, path: RegExp },
    (ctx: MyContext, parameters: Record<string, string>) => Promise<void>,
];
const specialActions: SpecialAction[] = [

[{ kind: 'id-before', method: 'POST', path: /^\/signin$/ },
async function handleSignIn(ctx) {
    ratelimits.idSignIn.request(ctx.ip);

    const [username, password] = getBasicAuthorization(ctx);
    if (!username || !password) {
        throw new MyError('common', 'invalid user name or password');
    }

    let user = userStorage.find(u => !collator.compare(u.name, username));
    if (!user) {
        const queryResult = await pool.query<UserData>(
            'SELECT "id", "name", "active", "secret", "apps" FROM "user" WHERE "name" ILIKE $1', [username]);
        if (queryResult.rows.length == 0) {
            throw new MyError('common', 'invalid user name or password');
        }
        user = queryResult.rows[0];
        // check again, because task schedule may happen cross await point
        if (!userStorage.some(u => !collator.compare(u.name, username))) {
            userStorage.push(user);
        }
    }

    if (!user.active) {
        throw new MyError('common', 'invalid user name or password');
    } else if (!(await otplib.verify({ secret: user.secret, token: password, crypto: OtplibCryptoPlugin })).valid) {
        throw new MyError('common', 'invalid user name or password');
    }

    ctx.status = 200;
    ctx.body = await createUserSession(ctx, user.id);
}],

[{ kind: 'id-before', method: 'GET', path: /^\/signup$/ },
async function handleGetAllowSignUp(ctx) {
    ctx.status = 200;
    ctx.body = { a: AllowSignUp };
}],

[{ kind: 'id-before', method: 'GET', path: /^\/signup\?name=(?<username>\w+)$/ },
async function handlePrepareSignUp(ctx, parameters) {
    if (!AllowSignUp) { throw new MyError('not-found', 'action not found'); } // makes it look like normal unknown api

    const username = parameters['username'];
    if (!username) {
        throw new MyError('common', 'user name cannot be empty');
    }
    if (userStorage.some(u => !collator.compare(u.name, username))) {
        throw new MyError('common', 'user name already exists');
    } else {
        const queryResult = await pool.query<UserData>(
            'SELECT "id", "name", "active", "secret", "apps" FROM "user" WHERE "name" ILIKE $1', [username]);
        if (queryResult.rows.length != 0) {
            userStorage.push(queryResult.rows[0]);
            throw new MyError('common', 'user name already exists');
        }
    }

    const secret = otplib.generateSecret({ crypto: OtplibCryptoPlugin });
    const text = `otpauth://totp/example.com:${username}?secret=${secret}&period=30&digits=6&algorithm=SHA1&issuer=example.com`;
    const dataurl = await qrcode.toDataURL(text, { type: 'image/webp' });

    ctx.status = 200;
    // you may think you need to store secret here and return something like secret id to work,
    // but the returned qrcode already contains the literal secret,
    // and the sign up operation works as long as the provided secret and 2fa is consistent, so no need to do that
    // TODO generate token and url at client side?
    ctx.body = { secret, dataurl };
}],

[{ kind: 'id-before', method: 'POST', path: /^\/signup/ },
async function handleSignUp(ctx) {
    if (!AllowSignUp) { throw new MyError('not-found', 'action not found'); } // makes it look like normal unknown api

    const [username, secret, password] = getBasicAuthorization(ctx);
    if (!username) {
        throw new MyError('common', 'user name cannot be empty');
    }

    if (userStorage.some(u => !collator.compare(u.name, username))) {
        throw new MyError('common', 'user name already exists');
    } else {
        const queryResult = await pool.query<UserData>(
            'SELECT "id", "name", "active", "secret", "apps" FROM "user" WHERE "name" ILIKE $1', [username]);
        if (queryResult.rows.length != 0) {
            userStorage.push(queryResult.rows[0]);
            throw new MyError('common', 'user name already exists');
        }
    }

    if (!secret || !password) {
        throw new MyError('common', 'invalid user name or password');
    } else if (!(await otplib.verify({ secret, token: password, crypto: OtplibCryptoPlugin })).valid) {
        throw new MyError('common', 'invalid user name or password');
    }

    const insertResult = await pool.query<UserData>(
        `INSERT INTO "user" ("name", "active", "secret", "apps") VALUES ($1, TRUE, $2, '{}') RETURNING "id"`, [username, secret]);
    const user: UserData = { id: insertResult.rows[0].id, name: username, active: true, secret: secret, apps: [] };
    userStorage.push(user);

    ctx.status = 201;
    ctx.body = await createUserSession(ctx, user.id);
}],

// this is same as in kind: app-after, it's ok to duplicate because it's really small
[{ kind: 'id-after', method: 'GET', path: /^\/user-credential$/ },
async function handleGetUserCredential(ctx) {
    const user = userStorage.find(u => u.id == ctx.state.userId);
    const session = userSessionStorage.find(s => s.id == ctx.state.sessionId);
    ctx.status = 200;
    ctx.body = { id: user.id, name: user.name, sessionId: session.id, sessionName: session.name } as UserCredential;
}],

[{ kind: 'id-after', method: 'POST', path: /^\/generate-authorization-code$/ },
async function handleGenerateAuthorizationCode(ctx) {

    const returnAddress = (ctx.request.body as { return: string })?.return;
    if (!returnAddress) { throw new MyError('common', 'invalid return address', returnAddress); }

    const app = allApplications.find(a =>
        returnAddress.startsWith(a.host == 'app.example.com' ? `https://${a.host}/${a.name}` : `https://${a.host}`));
    if (!app) { throw new MyError('common', 'invalid return address', JSON.stringify(allApplications)); }

    ratelimits.appSignIn[app.name].request(ctx.ip);

    const user = await getUserById(ctx.state.userId);
    if (!user.active) {
        throw new MyError('common', 'invalid user');
    } else if (user.id != 1 && !user.apps.includes(app.name)) {
        throw new MyError('access-control');
    }

    const code = generateRandomText(64);
    authorizationCodeStorage.push({
        userId: ctx.state.userId,
        sessionId: ctx.state.sessionId,
        appname: app.name,
        value: code,
        expireTime: ctx.state.time.add(1, 'minute'),
    });

    ctx.status = 200;
    ctx.body = { code };
}],

// use PATCH /user-credential instead of PATCH /users/:userid because I do not have /users related features
[{ kind: 'id-after', method: 'PATCH', path: /^\/user-credential$/ },
async function handleUpdateUserName(ctx) {

    const newUserName = (ctx.request.body as { name: string })?.name;
    if (!newUserName) { throw new MyError('common', 'invalid new user name'); }

    const user = await getUserById(ctx.state.userId);
    if (user.name == newUserName) { ctx.status = 201; return; } // ignore no change but allow case change

    if (userStorage.some(u => u.id != user.id && !collator.compare(u.name, newUserName))) {
        throw new MyError('common', 'user name already exists');
    } else {
        const queryResult = await pool.query<UserData>(
            'SELECT "id", "name", "active", "secret", "apps" FROM "user" WHERE "id" <> $1 AND "name" ILIKE $2', [user.id, newUserName]);
        if (queryResult.rows.length != 0) {
            userStorage.push(queryResult.rows[0]);
            throw new MyError('common', 'user name already exists');
        }
    }

    user.name = newUserName;
    await pool.query('UPDATE "user" SET "name" = $1 WHERE "id" = $2', [newUserName, user.id]);

    ctx.status = 201;
}],

[{ kind: 'id-after', method: 'GET', path: /^\/user-sessions$/ },
async function handleGetUserSessions(ctx) {
    // you always cannot tell whether all sessions already loaded from db (unless new runtime memory storage added)
    // so always load from db and replace user session storage

    const queryResult = await pool.query<UserSessionData>(
        'SELECT "id", "user_id", "name", "access_token", "last_access_time", "last_access_address" FROM "user_session" WHERE "user_id" = $1',
        [ctx.state.userId]);
    // update storage
    // // this is how you filter by predicate in place
    while (userSessionStorage.some(d => d.user_id == ctx.state.userId)) {
        userSessionStorage.splice(userSessionStorage.findIndex(d => d.user_id == ctx.state.userId), 1);
    }
    userSessionStorage.push(...queryResult.rows);

    ctx.status = 200;
    ctx.body = queryResult.rows.map<UserSession>(d => ({
        id: d.id,
        name: d.name,
        // use custom format to avoid millisecond part
        lastAccessTime: d.last_access_time.format('YYYY-MM-DDTHH:mm:ss[Z]'),
        lastAccessAddress: d.last_access_address,
    })).concat(applicationSessionStorage.map<UserSession>(a => ({
        app: a.appname,
        // use custom format to avoid millisecond part
        lastAccessTime: a.lastAccessTime.format('YYYY-MM-DDTHH:mm:ss[Z]'),
    })));
}],

[{ kind: 'id-after', method: 'PATCH', path: /^\/user-sessions\?id=(?<session_id>\d+)$/ },
async function handleUpdateSessionName(ctx, parameters) {

    const sessionId = parseInt(parameters['session_id']);
    if (isNaN(sessionId) || sessionId == 0) { throw new MyError('common', 'invalid session id'); }

    const session = userSessionStorage.find(d => d.id == sessionId);
    if (!session) {
        throw new MyError('common', 'invalid session id');
    } else if (session.user_id != ctx.state.userId) {
        throw new MyError('common', 'invalid session id');
    }

    const newSessionName = (ctx.request.body as any)?.name;
    if (!newSessionName) { throw new MyError('common', 'invalid new session name'); }

    session.name = newSessionName;
    await pool.query('UPDATE "user_session" SET "name" = $1 WHERE "id" = $2', [newSessionName, sessionId]);

    ctx.status = 201;
}],

[{ kind: 'id-after', method: 'DELETE', path: /^\/user-sessions\?id=(?<session_id>\d+)$/ },
async function handleRemoveSession(ctx, parameters) {

    const sessionId = parseInt(parameters['session_id']);
    if (isNaN(sessionId) || sessionId == 0) { throw new MyError('common', 'invalid session id'); }

    const session = userSessionStorage.find(d => d.id == sessionId);
    if (!session) {
        throw new MyError('common', 'invalid session id');
    } else if (session.user_id != ctx.state.userId) {
        throw new MyError('common', 'invalid session id');
    }

    userSessionStorage.splice(userSessionStorage.findIndex(d => d.id == sessionId), 1);
    await pool.query('DELETE FROM "user_session" WHERE "id" = $1', [sessionId]);

    ctx.status = 204;
}],

// this is literally the application's sign in operation
// (give a credential information and get an access token back) so ok to called signin
[{ kind: 'app-before', method: 'POST', path: /^\/signin$/ },
async function handleApplicationSignIn(ctx) {
    const code = getBearerAuthorization(ctx);

    const data = authorizationCodeStorage.find(c => c.value == code);
    if (!data) { throw new MyError('auth', undefined, 'invalid authorization code'); }
    // always remove from valid authorization codes
    authorizationCodeStorage.splice(authorizationCodeStorage.findIndex(c => c.value == code), 1);

    if (ctx.state.appconfig.name != data.appname || ctx.state.time.isAfter(data.expireTime)) {
        throw new MyError('auth', undefined, 'invalid authorization code');
    }

    ratelimits.appSignIn[data.appname].request(ctx.ip);

    const user = await getUserById(data.userId);
    if (!user.active) {
        throw new MyError('auth', undefined, 'user is not active');
    } else if (user.id != 1 && user.apps.includes(ctx.state.appconfig.name)) {
        throw new MyError('auth', undefined, 'app not allowed');
    } else if (!userSessionStorage.some(s => s.id == data.sessionId)) {
        throw new MyError('auth', undefined, 'invalid session id');
    }

    const accessToken = generateRandomText(42);
    applicationSessionStorage.push({
        userId: data.userId,
        sessionId: data.sessionId,
        appname: data.appname,
        accessToken,
        lastAccessTime: ctx.state.time,
    });

    ctx.status = 200;
    ctx.body = { accessToken };
}],

// this is same as in kind: id-after, it's ok to duplicate because it's really small
[{ kind: 'app-after', method: 'GET', path: /^\/user-credential$/ },
async function handleGetUserCredential(ctx) {
    const user = userStorage.find(u => u.id == ctx.state.userId);
    const session = userSessionStorage.find(s => s.id == ctx.state.sessionId);
    ctx.status = 200;
    ctx.body = { id: user.id, name: user.name, sessionId: session.id, sessionName: session.name } as UserCredential;
}],

[{ kind: 'app-after', method: 'POST', path: /^\/signout$/ },
async function handleSignOut(ctx) {
    // no sessionid available for application session, use access token
    const accessToken = getBearerAuthorization(ctx);
    // this will not not found because it just past authentication
    applicationSessionStorage.splice(applicationSessionStorage.findIndex(d => d.accessToken == accessToken), 1);

    ctx.status = 204;
}],
];

async function authenticateIdentityProvider(ctx: MyContext) {
    const accessToken = getBearerAuthorization(ctx);

    let session = userSessionStorage.find(d => d.access_token == accessToken);
    if (!session) {
        const queryResult = await pool.query<UserSessionData>(
            'SELECT "id", "name", "access_token", "user_id", '
            + '"last_access_time", "last_access_address" FROM "user_session" WHERE "access_token" = $1', [accessToken]);
        if (queryResult.rows.length == 0) {
            throw new MyError('auth', undefined, 'invalid access token');
        }
        session = queryResult.rows[0];
        userSessionStorage.push(session);
    }

    if (session.last_access_time.add(30, 'day').isBefore(ctx.state.time)) {
        // check expires or update last access time
        await pool.query('DELETE FROM "user_session" WHERE "id" = $1', [session.id]);
        userSessionStorage.splice(userSessionStorage.findIndex(d => d.id == session.id), 1);
        throw new MyError('auth', undefined, 'authorization expired');
    }

    // this means ctx.state.user.id must be in userStorage after pass authentication
    const user = await getUserById(session.user_id);
    if (!user.active) {
        throw new MyError('auth', undefined, 'authorization inactive');
    }

    session.last_access_time = ctx.state.time;
    session.last_access_address = ctx.ip || 'unknown';
    // avoid ipv4 compatible ipv6 address, e.g. ::ffff:1.2.3.4, why do koa default to this?
    if (session.last_access_address.startsWith('::ffff:') && /^\d+\.\d+\.\d+\.\d+$/.test(session.last_access_address.substring(7))) {
        session.last_access_address = session.last_access_address.substring(7);
    }
    await pool.query(
        'UPDATE "user_session" SET "last_access_time" = $1, "last_access_address" = $2 WHERE "id" = $3',
        [session.last_access_time, session.last_access_address, session.id]);

    ctx.state.userId = user.id;
    ctx.state.sessionId = session.id;
}

async function authenticateApplication(ctx: MyContext) {
    const accessToken = getBearerAuthorization(ctx);

    const session = applicationSessionStorage.find(d => d.accessToken == accessToken);
    if (!session) { throw new MyError('auth', undefined, 'invalid access token'); }

    if (session.appname != ctx.state.appconfig.name) {
        throw new MyError('auth', undefined, 'app mismatch');
    }
    // NOTE application access token lifetime 1 hour
    if (session.lastAccessTime.add(1, 'hour').isBefore(ctx.state.time)) {
        applicationSessionStorage.splice(applicationSessionStorage.findIndex(d => d.accessToken == accessToken), 1);
        throw new MyError('auth', undefined, 'session expired');
    }

    const user = await getUserById(session.userId);
    if (!user.active) {
        throw new MyError('auth', undefined, 'user inactive');
    } else if (!userSessionStorage.some(s => s.id == session.sessionId)) {
        throw new MyError('auth', undefined, 'user session not found, when will this happen?');
    } if (user.id != 1 && user.apps.includes(ctx.state.appconfig.name)) {
        throw new MyError('access-control');
    }

    session.lastAccessTime = ctx.state.time;
    ctx.state.userId = user.id;
}

export async function handleRequestAuthentication(ctx: MyContext, next: koa.Next): Promise<any> {
    ratelimits.all.request('');
    ctx.state.time = dayjs.utc();

    if (ctx.origin == 'https://id.example.com') {
        for (const [{ method, path }, handler] of specialActions.filter(a => a[0].kind == 'id-before')) {
            const match = path.exec(ctx.url);
            if (method == ctx.method && match) { await handler(ctx, match.groups); return; }
        }

        await authenticateIdentityProvider(ctx);

        for (const [{ method, path }, handler] of specialActions.filter(a => a[0].kind == 'id-after')) {
            const match = path.exec(ctx.url);
            if (method == ctx.method && match) { await handler(ctx, match.groups); return; }
        }
        throw new MyError('not-found', 'action not found'); // id.example.com api invocation should end here
    } else {
        ratelimits.apps[ctx.state.appconfig.name].request(ctx.ip || 'unknown');

        // special actions are all private
        for (const [{ method, path }, handler] of specialActions.filter(a => a[0].kind == 'app-before')) {
            const match = path.exec(ctx.url);
            if (method == ctx.method && match) { await handler(ctx, match.groups); return; }
        }
        for (const [{ method, path }, handler] of specialActions.filter(a => a[0].kind == 'app-after')) {
            const match = path.exec(ctx.url);
            if (method == ctx.method && match) {
                await authenticateApplication(ctx);
                await handler(ctx, match.groups);
                return;
            }
        }

        // NOTE need the trailing /, if you want to call any path, the trailing / is always needed
        if (!ctx.path.startsWith(`/${ctx.state.appconfig.name}/`)) {
            throw new MyError('not-found', 'action not found');
        }
        // don't forget the trailing / in startswith parameter
        ctx.state.annonymous = ctx.path.startsWith(`/${ctx.state.appconfig.name}/public/`);
        if (!ctx.state.annonymous) {
            await authenticateApplication(ctx);
        }

        return await next(); // goto application server
    }
}

async function handleRevoke(sessionId: number, result: AdminInterfaceResult): Promise<void> {
    try {
        const deleteResult = await pool.query('DELETE FROM "user_session" WHERE "id" = $1', [sessionId]);
        result.status = 'ok'; // remove from cache will not error, so this is ok
        result.logs.push(`delete from database usersession`, deleteResult);
    } catch (error) {
        result.status = 'error';
        result.logs.push(`delete from database usersession error`, error);
    }
    const index = userSessionStorage.findIndex(d => d.id == sessionId);
    if (index >= 0) {
        result.logs.push(`remove from cache`, userSessionStorage.splice(index, 1));
    } else {
        result.logs.push('not in cache?');
    }
}
async function handleActivateUser(userId: number, newActive: boolean, result: AdminInterfaceResult): Promise<void> {
    if (newActive) {
        try {
            const updateResult = await pool.query('UPDATE "user" SET "active" = TRUE WHERE "id" = $1', [userId]);
            result.status = 'ok'; // remove from cache will not error, so this is ok
            result.logs.push('update database user', updateResult);
        } catch (error) {
            result.status = 'error';
            result.logs.push('update database user error', error);
        }
        const cacheRecord = userStorage.find(u => u.id == userId);
        if (cacheRecord) {
            cacheRecord.active = true;
            result.logs.push('update cache', cacheRecord);
        } else {
            result.logs.push('not in cache');
        }
    } else {
        result.status = 'ok'; // default to ok, may change to error later
        try {
            const updateResult = await pool.query('UPDATE "user" SET "active" = FALSE WHERE "id" = $1', [userId]);
            result.logs.push('update database user', updateResult);
        } catch (error) {
            result.status = 'error';
            result.logs.push('update database user error', error);
        }
        // also remove all sessions
        try {
            const deleteResult = await pool.query('DELETE FROM "user_session" WHERE "user_id" = $1', [userId]);
            result.logs.push('delete from database usersssion', deleteResult);
        } catch (error) {
            result.status = 'error';
            result.logs.push('delete from database usersession error', error);
        }
        const userCacheRecord = userStorage.find(u => u.id == userId);
        if (userCacheRecord) {
            userCacheRecord.active = false;
            result.logs.push(`update user cache`, userCacheRecord);
        } else {
            result.logs.push('not in user cache');
        }

        const removedSessionCacheRecords = userSessionStorage.filter(s => s.user_id == userId);
        userSessionStorage.splice(0, userSessionStorage.length, ...userSessionStorage.filter(s => s.user_id != userId));
        if (removedSessionCacheRecords.length) {
            result.logs.push('remove from user session cache', removedSessionCacheRecords);
        }
    }
}

export async function handleAccessCommand(command: AdminInterfaceCommand, result: AdminInterfaceResult): Promise<void> {

    // revoke session (id.example.com user session)
    if (command.kind == 'access-control:revoke') {
        return await handleRevoke(command.sessionId, result);

    // activate/inactivate user
    } else if (command.kind == 'access-control:user:enable') {
        return await handleActivateUser(command.userId, true, result);
    } else if (command.kind == 'access-control:user:disable') {
        return await handleActivateUser(command.userId, false, result);

    // enable/disable signup
    } else if (command.kind == 'access-control:signup:enable') {
        AllowSignUp = true;
        if (AllowSignUpTimer) { clearTimeout(AllowSignUpTimer); }
        AllowSignUpTimer = setTimeout(() => AllowSignUp = false, 43200_000);
        result.status = 'ok';
        result.logs.push('enable sign up');
    } else if (command.kind == 'access-control:signup:disable') {
        AllowSignUp = false;
        if (AllowSignUpTimer) { clearTimeout(AllowSignUpTimer); }
        result.status = 'ok';
        result.logs.push('disable sign up');

    // display
    } else if (command.kind == 'access-control:display-user-sessions') {
        result.status = 'ok';
        result.logs.push(userSessionStorage);
    } else if (command.kind == 'access-control:display-application-sessions') {
        result.status = 'ok';
        result.logs.push(applicationSessionStorage);
    } else if (command.kind == 'access-control:display-rate-limits') {
        result.status = 'ok';
        result.logs.push({
            all: ratelimits.all.buckets,
            apps: Object.fromEntries(Object.entries(ratelimits.apps).map(([k, v]) => [k, v.buckets])),
        });
    }
}
