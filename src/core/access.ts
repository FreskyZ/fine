import crypto from 'node:crypto';
import dayjs from 'dayjs';
import koa from 'koa';
import { authenticator } from 'otplib';
import qrcode from 'qrcode';
import type { UserSession, UserCredential } from '../shared/access.js';
import type { AdminAccessCommand } from '../shared/admin.js';
import type { QueryResult, ManipulateResult } from '../adk/database.js';
import { pool, QueryDateTimeFormat } from '../adk/database.js';
import { MyError } from './error.js';
import { log } from './logger.js';
import { RateLimit } from './content.js';

// see docs/authentication.md
// handle sign in, sign out, sign up and user info requests, and dispatch app api

// context and ctx.state used in this program,
// they are assigned and used in this step or after this step, so put it here
export type MyContext = koa.ParameterizedContext<{
    now: dayjs.Dayjs,
    app: string,
    public: boolean,
    user: UserCredential,
}>;

export type WebappConfig = Record<string, {
    // in format `appname.example.com` or `app.example.com`,
    // no 'https://' prefix, no '/' postfix,
    // `app.example.com` means this is on `https://app.example.com/appname`
    host: string,
    // in format `nodejs:/absolute/path/to/server.js` or `socket:/absolute/path/to/socket.sock`
    server: string,
}>;
interface WebappRuntimeConfig {
    name: string,
    shared: boolean, // shared host, true for app.example.com, false for appname.example.com
    server: string,
    version: number, // appended to dynamic import url to hot reload
}
export let webapps: WebappRuntimeConfig[];
export function setupAccessControl(config: WebappConfig) {
    webapps = Object.entries(config).map(c => ({
        name: c[0],
        shared: c[1].host == 'app.example.com',
        server: c[1].server,
        version: 0,
    }));
    ratelimits.apps = Object.fromEntries(webapps.map(a => [a.name, new RateLimit(10, 1)]));
    ratelimits.appSignIn = Object.fromEntries(webapps.map(a => [a.name, new RateLimit(1, 1)]));
}

// rate limit various aspects
const ratelimits = {
    // this limits all (over all ip and app),
    // when requesting a token, key is empty string
    all: new RateLimit(100, 1),
    // api invocation per app then per ip, this use (10, 1)
    apps: {} as Record<string, RateLimit>,
    // specifically limit sign in operation, per ip
    idSignIn: new RateLimit(1, 1),
    // per app per ip, this use (1, 1)
    // generate authorization code and application sign in use the same limit
    appSignIn: {} as Record<string, RateLimit>,
};

// all request here is cross origin because api.example.com does not have ui
// this is before authentication and don't know the user, although app is known here, cannot authorize user to access app
export async function handleRequestCrossOrigin(ctx: MyContext, next: koa.Next): Promise<void> {
    if (ctx.subdomains[0] != 'api') { throw new MyError('unreachable'); }

    // validate origin and assign ctx.state.app
    if (ctx.origin == 'https://id.example.com') {
        ctx.state.app = 'id'; // use id (identity provider) for id.example.com
    } else if (ctx.origin == 'https://app.example.com') {
        ctx.state.app = ctx.path.substring(1).split('/')[0].trim();
        // direct return and do not set access-control-* and let browser reject it
        if (!webapps.some(a => a.name == ctx.state.app && a.shared)) { return; }
    } else {
        ctx.state.app = webapps.find(a => !a.shared && ctx.origin == `https://${a.name}.example.com`)?.name;
        // direct return and do not set access-control-* and let browser reject it
        if (!ctx.state.app) { return; }
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
    Id: number,
    Name: string,
    Active: boolean,
    Secret: string,
    Apps: string,
}
interface UserSessionData {
    Id: number,
    UserId: number,
    Name: string,
    AccessToken: string,
    LastAccessTime: string,
    LastAccessAddress: string,
}
// cache database data, entries will not expire,
// because I should and will not directly update db User and UserSession table
const userStorage: UserData[] = [];
const userSessionStorage: UserSessionData[] = [];

// in memory application authorization code and access token storage
// they have very short lifetime and no need to save to database and consider server restart
interface AuthorizationCodeData {
    userId: number,
    app: string,
    value: string,
    expireTime: dayjs.Dayjs,
}
interface ApplicationSessionData {
    userId: number,
    app: string,
    accessToken: string,
    lastAccessTime: dayjs.Dayjs,
}
const authorizationCodeStorage: AuthorizationCodeData[] = [];
const applicationSessionStorage: ApplicationSessionData[] = [];
setInterval(() => {
    const validAuthorizationCodes = authorizationCodeStorage.filter(c => dayjs.utc().isBefore(c.expireTime));
    authorizationCodeStorage.splice(0, authorizationCodeStorage.length);
    validAuthorizationCodes.forEach(c => authorizationCodeStorage.push(c));
    const validApplicationAccessTokens = applicationSessionStorage.filter(c => dayjs.utc().isAfter(c.lastAccessTime.add(1, 'hour')));
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
    if (!raw) { return null; }
    if (!raw.startsWith('Basic ')) { return null; }
    // this will be very high if you don't inline everything
    let decoded: string; try { decoded = atob(raw.substring(6)); } catch { return null; }
    return decoded.split(':').map(v => v.trim()).filter(v => v);
}
// get normal bearer access token from request header
function getBearerAuthorization(ctx: MyContext) {
    const raw = ctx.get('authorization');
    if (!raw) { throw new MyError('auth', 'unauthorized'); }
    if (!raw.startsWith('Bearer ')) { throw new MyError('auth', 'unauthorized'); }

    const accessToken = raw.substring(7);
    if (!accessToken) { throw new MyError('auth', 'unauthorized'); }
    return accessToken;
}

// and save to cache
async function getUserById(userId: number) {
    let user = userStorage.find(u => u.Id == userId);
    if (!user) {
        const [rows] = await pool.query<QueryResult<UserData>[]>(
            'SELECT `Id`, `Name`, `Active`, `Secret`, `Apps` FROM `User` WHERE `Id` = ?', [userId]);
        user = rows[0];
        // check again, because task schedule may happen cross await point
        if (!userStorage.some(u => u.Id == userId)) {
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
        Id: 0,
        UserId: userId,
        Name: '<unnamed>',
        AccessToken: accessToken,
        LastAccessTime: ctx.state.now.format(QueryDateTimeFormat.datetime),
        LastAccessAddress: ctx.socket.remoteAddress,
    };
    const [result] = await pool.execute<ManipulateResult>(
        'INSERT INTO `UserSession` (`UserId`, `Name`, `AccessToken`, `LastAccessTime`, `LastAccessAddress`) VALUES (?, ?, ?, ?, ?)',
        [session.UserId, session.Name, session.AccessToken, session.LastAccessTime, session.LastAccessAddress]);
    session.Id = result.insertId;
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

    let user = userStorage.find(u => !collator.compare(u.Name, username));
    if (!user) {
        const [rows] = await pool.query<QueryResult<UserData>[]>(
            'SELECT `Id`, `Name`, `Active`, `Secret`, `Apps` FROM `User` WHERE `Name` = ?', [username]);
        if (!Array.isArray(rows) || rows.length == 0) {
            throw new MyError('common', 'invalid user name or password');
        }
        user = rows[0];
        // check again, because task schedule may happen cross await point
        if (!userStorage.some(u => !collator.compare(u.Name, username))) {
            userStorage.push(rows[0]);
        }
    }

    if (!user.Active) {
        throw new MyError('common', 'user is not active');
    }
    if (!authenticator.check(password, user.Secret)) {
        throw new MyError('common', 'invalid user name or password');
    }

    ctx.status = 200;
    ctx.body = await createUserSession(ctx, user.Id);
}],

[{ kind: 'id-before', method: 'GET', path: /^\/signup$/ },
async function handleGetAllowSignUp(ctx) {
    ctx.status = 200;
    ctx.body = { a: AllowSignUp };
}],

[{ kind: 'id-before', method: 'GET', path: /^\/signup\?name=(?<username>\w+)$/ },
async function handleGetAuthenticatorSecret(ctx, parameters) {
    if (!AllowSignUp) { throw new MyError('not-found', 'invalid invocation'); } // makes it look like normal unknown api

    const username = parameters['username'];
    if (!username) {
        throw new MyError('common', 'user name cannot be empty');
    }
    if (userStorage.some(u => !collator.compare(u.Name, username))) {
        throw new MyError('common', 'user name already exists');
    } else {
        const [rows] = await pool.query<QueryResult<UserData>[]>(
            'SELECT `Id`, `Name`, `Active`, `Secret`, `Apps` FROM `User` WHERE `Name` = ?', [username]);
        if (Array.isArray(rows) && rows.length != 0) {
            userStorage.push(rows[0]);
            throw new MyError('common', 'user name already exists');
        }
    }

    const secret = authenticator.generateSecret();
    const text = `otpauth://totp/example.com:${username}?secret=${secret}&period=30&digits=6&algorithm=SHA1&issuer=example.com`;
    const dataurl = await qrcode.toDataURL(text, { type: 'image/webp' });

    ctx.status = 200;
    ctx.body = { secret, dataurl };
}],

[{ kind: 'id-before', method: 'POST', path: /^\/signup/ },
async function handleSignUp(ctx) {
    if (!AllowSignUp) { throw new MyError('not-found', 'invalid invocation'); } // makes it look like normal unknown api

    // it's ok to allow client side provide secret, as long as secret and password match
    const [username, secret, password] = getBasicAuthorization(ctx);
    if (!username) {
        throw new MyError('common', 'user name cannot be empty');
    }
    
    if (userStorage.some(u => !collator.compare(u.Name, username))) {
        throw new MyError('common', 'user name already exists');
    } else {
        const [rows] = await pool.query<QueryResult<UserData>[]>(
            'SELECT `Id`, `Name`, `Active`, `Secret`, `Apps` FROM `User` WHERE `Name` = ?', [username]);
        if (Array.isArray(rows) && rows.length != 0) {
            userStorage.push(rows[0]);
            throw new MyError('common', 'user name already exists');
        }
    }

    if (!secret || !password) {
        throw new MyError('common', 'invalid password');
    }
    if (!authenticator.check(password, secret)) {
        throw new MyError('common', 'invalid password');
    }

    const [result] = await pool.execute<ManipulateResult>(
        "INSERT INTO `User` (`Name`, `Active`, `Secret`, `Apps`) VALUES (?, 1, ?, '')", [username, secret]);
    const user: UserData = { Id: result.insertId, Name: username, Active: true, Secret: secret, Apps: '' };
    userStorage.push(user);

    ctx.status = 201;
    ctx.body = await createUserSession(ctx, user.Id);
}],

// this is same as in kind: app-after, it's ok to duplicate because it's really small
[{ kind: 'id-after', method: 'GET', path: /^\/user-credential$/ },
async function handleGetUserCredential(ctx) {
    ctx.status = 200;
    ctx.body = ctx.state.user;
}],

[{ kind: 'id-after', method: 'POST', path: /^\/generate-authorization-code$/ },
async function handleGenerateAuthorizationCode(ctx) {

    const returnAddress = (ctx.request.body as { return: string })?.return;
    if (!returnAddress) { throw new MyError('common', 'invalid return address'); }

    const app = webapps.find(a =>
        returnAddress.startsWith(a.shared ? `https://app.example.com/${a.name}` : `https://${a.name}.example.com`))?.name;
    if (!app) { throw new MyError('common', 'invalid return address'); }

    ratelimits.appSignIn[app].request(ctx.ip);

    const user = await getUserById(ctx.state.user.id);
    if (!user.Active) {
        throw new MyError('common', 'inactive user');
    }
    if (user.Id != 1 && !user.Apps.split(',').includes(app)) {
        throw new MyError('common', 'app not allowed');
    }

    const code = generateRandomText(64);
    authorizationCodeStorage.push({ userId: ctx.state.user.id, app, value: code, expireTime: ctx.state.now.add(1, 'minute') });

    ctx.status = 200;
    ctx.body = { code };
}],

// use PATCH /user-credential instead of PATCH /users/:userid because I do not have /users related features
[{ kind: 'id-after', method: 'PATCH', path: /^\/user-credential$/ },
async function handleUpdateUserName(ctx) {

    const newUserName = (ctx.request.body as { name: string })?.name;
    if (!newUserName) { throw new MyError('common', 'invalid new user name'); }

    const user = await getUserById(ctx.state.user.id);
    if (user.Name == newUserName) { ctx.status = 201; return; } // ignore no change but allow case change

    if (userStorage.some(u => u.Id != user.Id && !collator.compare(u.Name, newUserName))) {
        throw new MyError('common', 'user name already exists');
    } else {
        const [rows] = await pool.query<QueryResult<UserData>[]>(
            'SELECT `Id`, `Name`, `Active`, `Secret`, `Apps` FROM `User` WHERE `Id` <> ? AND `Name` = ?', [user.Id, newUserName]);
        if (Array.isArray(rows) && rows.length != 0) {
            userStorage.push(rows[0]);
            throw new MyError('common', 'user name already exists');
        }
    }

    user.Name = newUserName;
    await pool.execute('UPDATE `User` SET `Name` = ? WHERE `Id` = ?', [newUserName, user.Id]);

    ctx.status = 201;
}],

[{ kind: 'id-after', method: 'GET', path: /^\/user-sessions$/ },
async function handleGetUserSessions(ctx) {
    // you always cannot tell whether all sessions already loaded from db (unless new runtime memory storage added)
    // so always load from db and replace user session storage

    const [idSessions] = await pool.query<QueryResult<UserSessionData>[]>(
        'SELECT `Id`, `UserId`, `Name`, `AccessToken`, `LastAccessTime`, `LastAccessAddress` FROM `UserSession` WHERE `UserId` = ?', [ctx.state.user.id]);
    // update storage
    // // this is how you filter by predicate in place
    while (userSessionStorage.some(d => d.UserId == ctx.state.user.id)) {
        userSessionStorage.splice(userSessionStorage.findIndex(d => d.UserId == ctx.state.user.id), 1);
    }
    userSessionStorage.push(...idSessions);

    ctx.status = 200;
    ctx.body = idSessions.map<UserSession>(d => ({
        id: d.Id,
        name: d.Name,
        lastAccessTime: dayjs.utc(d.LastAccessTime, QueryDateTimeFormat.datetime).toISOString(),
        lastAccessAddress: d.LastAccessAddress,
    })).concat(applicationSessionStorage.map<UserSession>(a => ({
        app: a.app,
        lastAccessTime: a.lastAccessTime.toISOString(),
    })));
}],

[{ kind: 'id-after', method: 'PATCH', path: /^\/user-sessions\?id=(?<session_id>\d+)$/ },
async function handleUpdateSessionName(ctx, parameters) {

    const sessionId = parseInt(parameters['session_id']);
    if (isNaN(sessionId) || sessionId == 0) { throw new MyError('common', 'invalid session id'); }

    const newSessionName = (ctx.request.body as any)?.name;
    if (!newSessionName) { throw new MyError('common', 'invalid new session name'); }

    const session = userSessionStorage.find(d => d.Id == sessionId);
    if (session.UserId != ctx.state.user.id) {
        throw new MyError('common', 'not my session');
    }

    session.Name = newSessionName;
    await pool.execute('UPDATE `UserSession` SET `Name` = ? WHERE `Id` = ?', [newSessionName, sessionId]);

    ctx.status = 201;
}],

[{ kind: 'id-after', method: 'DELETE', path: /^\/user-sessions\?id=(?<session_id>\d+)$/ },
async function handleRemoveSession(ctx, parameters) {

    const sessionId = parseInt(parameters['session_id']);
    if (isNaN(sessionId) || sessionId == 0) { throw new MyError('common', 'invalid session id'); }

    const session = userSessionStorage.find(d => d.Id == sessionId);
    if (!session) {
        throw new MyError('common', 'invalid session id');
    }
    if (session.UserId != ctx.state.user.id) {
        throw new MyError('common', 'not my session');
    }

    userSessionStorage.splice(userSessionStorage.findIndex(d => d.Id == sessionId), 1);
    await pool.execute('DELETE FROM `UserSession` WHERE `Id` = ?', [sessionId]);

    ctx.status = 204;
}],

// this is literally the application's sign in operation
// (give a credential information and get an access token back) so ok to called signin
[{ kind: 'app-before', method: 'POST', path: /^\/signin$/ },
async function handleApplicationSignIn(ctx) {
    const code = getBearerAuthorization(ctx);

    const data = authorizationCodeStorage.find(c => c.value == code);
    if (!data) { throw new MyError('auth', 'invalid authorization code'); }
    // always remove from valid authorization codes
    authorizationCodeStorage.splice(authorizationCodeStorage.findIndex(c => c.value == code), 1);

    if (ctx.state.app != data.app || ctx.state.now.isAfter(data.expireTime)) {
        throw new MyError('auth', 'invalid authorization code');
    }

    ratelimits.appSignIn[data.app].request(ctx.ip);

    const user = await getUserById(data.userId);
    if (!user.Active) {
        throw new MyError('auth', 'user is not active');
    }
    if (user.Id != 1 && user.Apps.split(',').includes(ctx.state.app)) {
        throw new MyError('auth', 'app not allowed');
    }

    const accessToken = generateRandomText(42);
    applicationSessionStorage.push({ userId: data.userId, app: data.app, accessToken, lastAccessTime: ctx.state.now });
    
    ctx.status = 200;
    ctx.body = { accessToken };
}],

// this is same as in kind: id-after, it's ok to duplicate because it's really small
[{ kind: 'app-after', method: 'GET', path: /^\/user-credential$/ },
async function handleGetUserCredential(ctx) {
    ctx.status = 200;
    ctx.body = ctx.state.user;
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

    let session = userSessionStorage.find(d => d.AccessToken == accessToken);
    if (!session) {
        const [rows] = await pool.query<QueryResult<UserSessionData>[]>(
            'SELECT `Id`, `Name`, `AccessToken`, `UserId`, `LastAccessTime`, '
            + '`LastAccessAddress` FROM `UserSession` WHERE `AccessToken` = ?', [accessToken]);
        if (!Array.isArray(rows) || rows.length == 0) {
            throw new MyError('auth', 'unauthorized');
        }
        session = rows[0];
        userSessionStorage.push(rows[0]);
    }

    if (dayjs.utc(session.LastAccessTime).add(30, 'day').isBefore(ctx.state.now)) {
        // check expires or update last access time
        await pool.execute('DELETE FROM `UserSession` WHERE `Id` = ? ', [session.Id]);
        userSessionStorage.splice(userSessionStorage.findIndex(d => d.Id == session.Id), 1);
        throw new MyError('auth', 'authorization expired');
    }

    // this means ctx.state.user.id must be in userStorage after pass authentication
    const user = await getUserById(session.UserId);
    if (!user.Active) {
        throw new MyError('auth', 'authorization inactive');
    }

    session.LastAccessTime = ctx.state.now.format(QueryDateTimeFormat.datetime);
    session.LastAccessAddress = ctx.ip || 'unknown';
    await pool.query(
        'UPDATE `UserSession` SET `LastAccessTime` = ?, `LastAccessAddress` = ? WHERE `Id` = ?',
        [session.LastAccessTime, session.LastAccessAddress, session.Id]);

    ctx.state.user = { id: user.Id, name: user.Name, sessionId: session.Id, sessionName: session.Name };
}

async function authenticateApplication(ctx: MyContext) {
    const accessToken = getBearerAuthorization(ctx);

    let session = applicationSessionStorage.find(d => d.accessToken == accessToken);
    if (!session) { throw new MyError('auth', 'unauthorized'); }

    if (session.app != ctx.state.app) {
        throw new MyError('auth', 'unauthorized');
    }
    // NOTE application access token lifetime 1 hour
    if (dayjs.utc(session.lastAccessTime).add(1, 'hour').isBefore(ctx.state.now)) {
        applicationSessionStorage.splice(applicationSessionStorage.findIndex(d => d.accessToken == accessToken), 1);
        throw new MyError('auth', 'authorization expired');
    }

    const user = await getUserById(session.userId);
    if (!user.Active) {
        throw new MyError('auth', 'authorization inactive');
    }
    if (user.Id != 1 && user.Apps.split(',').includes(ctx.state.app)) {
        throw new MyError('auth', 'unauthorized');
    }

    session.lastAccessTime = ctx.state.now;
    ctx.state.user = { id: user.Id, name: user.Name };
}

export async function handleRequestAuthentication(ctx: MyContext, next: koa.Next): Promise<any> {
    ratelimits.all.request('');
    ctx.state.now = dayjs.utc();
    
    if (ctx.origin == 'https://id.example.com') {
        for (const [{ method, path }, handler] of specialActions.filter(a => a[0].kind == 'id-before')) {
            const match = path.exec(ctx.path);
            if (method == ctx.method && match) { await handler(ctx, match.groups); return; }
        }

        await authenticateIdentityProvider(ctx);

        for (const [{ method, path }, handler] of specialActions.filter(a => a[0].kind == 'id-after')) {
            const match = path.exec(ctx.path);
            if (method == ctx.method && match) { await handler(ctx, match.groups); return; }
        }
        throw new MyError('not-found', 'invalid invocation'); // id.example.com api invocation should end here
    } else {
        ratelimits.apps[ctx.state.app].request(ctx.ip || 'unknown');

        // special actions are all private
        for (const [{ method, path }, handler] of specialActions.filter(a => a[0].kind == 'app-before')) {
            const match = path.exec(ctx.path);
            if (method == ctx.method && match) { await handler(ctx, match.groups); return; }
        }
        for (const [{ method, path }, handler] of specialActions.filter(a => a[0].kind == 'app-after')) {
            const match = path.exec(ctx.path);
            if (method == ctx.method && match) { 
                await authenticateApplication(ctx);
                await handler(ctx, match.groups);
                return;
            }
        }

        // NOTE need the trailing /, if you want to call any path, the trailing / is always needed
        if (!ctx.path.startsWith(`/${ctx.state.app}/`)) {
            throw new MyError('not-found', 'invalid-invocation');
        }
        // also need the trailing /
        ctx.state.public = ctx.path.startsWith(`/${ctx.state.app}/public/`);
        if (!ctx.state.public) {
            await authenticateApplication(ctx);
        }

        return await next(); // goto forward api
    }
}

export async function handleAccessCommand(command: AdminAccessCommand): Promise<void> {
    log.info({ type: 'admin command access', data: command });

    // activate/inactivate user
    if (command.type == 'activate-user') {
        await pool.execute('UPDATE `User` SET `Active` = 1 WHERE `Id` = ?', command.userId);
        const maybeCache = userStorage.find(u => u.Id == command.userId);
        if (maybeCache) { maybeCache.Active = true; }
    } else if (command.type == 'inactivate-user') {
        await pool.execute('UPDATE `User` SET `Active` = 0 WHERE `Id` = ?', command.userId);
        const maybeCache = userStorage.find(u => u.Id == command.userId);
        if (maybeCache) { maybeCache.Active = false; }
        // remove all user devices because front end when get unauthorized will discard access token
        await pool.execute('DELETE FROM `UserSession` WHERE `UserId` = ?', command.userId);
        while (userSessionStorage.some(d => d.UserId == command.userId)) {
            userSessionStorage.splice(userSessionStorage.findIndex(d => d.UserId == command.userId), 1);
        }

    // revoke access token
    } else if (command.type == 'revoke-session') {
        await pool.execute('DELETE FROM `UserDevice` WHERE `Id` = ?', command.sessionId);
        const maybeIndex = userSessionStorage.findIndex(d => d.Id == command.sessionId);
        if (maybeIndex >= 0) { userSessionStorage.splice(maybeIndex, 1); }

    // enable/disable signup
    } else if (command.type == 'enable-signup') {
        AllowSignUp = true;
        if (AllowSignUpTimer) { clearTimeout(AllowSignUpTimer); }
        AllowSignUpTimer = setTimeout(() => AllowSignUp = false, 43200_000);
    } else if (command.type == 'disable-signup') {
        AllowSignUp = false;
        if (AllowSignUpTimer) { clearTimeout(AllowSignUpTimer); }
    }
}
