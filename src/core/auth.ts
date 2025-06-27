import crypto from 'node:crypto';
import dayjs from 'dayjs';
import koa from 'koa';
import { authenticator } from 'otplib';
import qrcode from 'qrcode';
import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import type { UserSession, UserCredential } from '../shared/auth.js';
import type { AdminAccessCommand } from '../shared/admin.js';
import { pool, QueryDateTimeFormat } from '../adk/database.js';
import { MyError } from './error.js';
import { log } from './logger.js';
import { RateLimit } from './content.js';

// see docs/authentication.md
// handle sign in, sign out, sign up and user info requests, and dispatch app api

// koa context parameter after authentication
interface ContextState {
    now: dayjs.Dayjs,
    app: string,
    public: boolean,
    user: UserCredential,
}
export type AuthContext = koa.ParameterizedContext<ContextState>;

// db types are postfixed 'Data' compared to non postfixed api types
// they are defined here because they are not used outside
interface UserData {
    Id: number,
    Name: string,
    Active: boolean,
    Secret: string,
}
interface UserSessionData {
    Id: number,
    UserId: number,
    Name: string,
    AccessToken: string,
    LastAccessTime: string,
    LastAccessAddress: string,
}

// mysql2 query function need RowDataPacket, but this makes me
// cannot contrust a UserData if UserData extends RowDataPacket, so need separate types
type QueryResult<T> = T & RowDataPacket;

// cache user crendentials to prevent db operation every api call
// entries will not expire, because I should and will not directly update db User and UserSession table
const userStorage: UserData[] = [];
const userSessionStorage: UserSessionData[] = [];

interface AuthorizationCodeData {
    userId: number,
    app: string,
    value: string,
    expireTime: dayjs.Dayjs,
}
interface ApplicationAccessToken {
    userId: number,
    app: string,
    value: string,
    lastAccessTime: dayjs.Dayjs,
}
// authorization code and application access token is not saved to database
const authorizationCodeStorage: AuthorizationCodeData[] = [];
const applicationAccessTokenStorage: ApplicationAccessToken[] = [];

// ignore case comparator, this may need to be moved to some utility module
const collator = Intl.Collator('en', { sensitivity: 'base' });

export type WebappConfig = Record<string, {
    // small app use app.example.com/appname/, and is loaded in same process
    // major app use appname.example.com, and is communicated with domain socket
    small: boolean,
    // not in config, set at runtime, small app use this to hot reload
    // appended as query to dynamic import url, module loader will load new version if the query is not same
    version: number,
}>;
let webappconfig: WebappConfig;
const ratelimits = {
    all: new RateLimit(100, 1),
    allPublic: new RateLimit(10, 1),
    // per app private api rate limit
    private: {} as Record<string, RateLimit>,
};
export function setupAccessControl(config: WebappConfig) {
    webappconfig = Object.fromEntries(Object.entries(config).map(c => { c[1].version = 0; return c; }));
    ratelimits.private = Object.fromEntries(Object.entries(webappconfig).map(a => [a[0], new RateLimit(10, 1)]));
}

let AllowSignUp = false;
let AllowSignUpTimer: NodeJS.Timeout; // similar to some other features, sign up is timeout disabled after 12 hours if not manually disabled or reenabled

// generate random text in length
function generateRandomText(length: number) {
    return crypto.randomBytes(Math.ceil(length * 3 / 4)).toString('base64').slice(0, length);
}

// for sign in and sign up, authorization header is base64 encoded colon separated values
// return empty array for invalid value, which should be convenient to directly deconstruct the return value
function getBasicAuthorization(ctx: AuthContext) {
    const raw = ctx.get('authorization');
    if (!raw) { return null; }
    if (!raw.startsWith('Basic ')) { return null; }
    // this will be very high if you don't inline everything
    let decoded: string; try { decoded = atob(raw.substring(6)); } catch { return null; }
    return decoded.split(':').map(v => v.trim()).filter(v => v);
}
// get normal bearer access token from request header
function getBearerAuthorization(ctx: AuthContext) {
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
            'SELECT `Id`, `Name`, `Active`, `Secret` FROM `User` WHERE `Id` = ?', [userId]);
        user = rows[0];
        // check again, because task schedule may happen cross await point
        if (userStorage.some(u => u.Id == userId)) {
            userStorage.push(user);
        }
    }
    return user;
}

// for signin and signup, return access token
async function createUserSession(ctx: AuthContext, userId: number): Promise<{ accessToken: string }> {
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
    const [result] = await pool.execute<ResultSetHeader>(
        'INSERT INTO `UserSession` (`UserId`, `Name`, `AccessToken`, `LastAccessTime`, `LastAccessAddress`) VALUES (?, ?, ?, ?, ?)',
        [session.UserId, session.Name, session.AccessToken, session.LastAccessTime, session.LastAccessAddress]);
    session.Id = result.insertId;
    userSessionStorage.push(session);

    return { accessToken };
}

// use regex to dispatch special apis
// // this makes the usage looks like c# property/java annotation/python annotation/typescript metadata
type Router = [RegExp, (ctx: AuthContext, parameters: Record<string, string>) => Promise<void>];

// actions batch 1, special api used by id.example.com before authenticate, namely sign in and sign up
const actions1: Router[] = [

[/^POST \/signin$/,
async function handleSignIn(ctx) {

    const [username, password] = getBasicAuthorization(ctx);
    if (!username || !password) {
        throw new MyError('common', 'invalid user name or password');
    }

    let user = userStorage.find(u => !collator.compare(u.Name, username));
    if (!user) {
        const [rows] = await pool.query<QueryResult<UserData>[]>(
            'SELECT `Id`, `Name`, `Active`, `Secret` FROM `User` WHERE `Name` = ?', [username]);
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

[/^GET \/signup$/,
async function handleGetAllowSignUp(ctx) {
    ctx.status = 200;
    ctx.body = { a: AllowSignUp };
}],

[/^GET \/signup\/(?<username>\w+)$/,
async function handleGetAuthenticatorToken(ctx, parameters) {
    if (!AllowSignUp) { throw new MyError('not-found', 'invalid invocation'); } // makes it look like normal unknown api

    const username = parameters['username'];
    if (!username) {
        throw new MyError('common', 'user name cannot be empty');
    }
    if (userStorage.some(u => !collator.compare(u.Name, username))) {
        throw new MyError('common', 'user name already exists');
    } else {
        const [rows] = await pool.query<QueryResult<UserData>[]>(
            'SELECT `Id`, `Name`, `Active`, `Secret` FROM `User` WHERE `Name` = ?', [username]);
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

[/^POST \/signup/,
async function handleRegister(ctx) {
    if (!AllowSignUp) { throw new MyError('not-found', 'invalid invocation'); } // makes it look like normal unknown api

    const [username, secret, password] = getBasicAuthorization(ctx);
    if (!username) {
        throw new MyError('common', 'user name cannot be empty');
    }
    
    if (userStorage.some(u => !collator.compare(u.Name, username))) {
        throw new MyError('common', 'user name already exists');
    } else {
        const [rows] = await pool.query<QueryResult<UserData>[]>(
            'SELECT `Id`, `Name`, `Active`, `Sceret` FROM `User` WHERE `Name` = ?', [username]);
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

    const [result] = await pool.execute<ResultSetHeader>(
        'INSERT INTO `User` (`Name`, `Active`, `Sceret`) VALUES (?, 1, ?)', [username, secret]);
    const user: UserData = { Id: result.insertId, Name: username, Active: true, Secret: secret };
    userStorage.push(user);

    ctx.status = 201;
    ctx.body = await createUserSession(ctx, user.Id);
}]];

async function authenticateIdentityProvider(ctx: AuthContext) {
    const accessToken = getBearerAuthorization(ctx);

    let session = userSessionStorage.find(d => d.AccessToken == accessToken);
    if (!session) {
        const [rows] = await pool.query<QueryResult<UserSessionData>[]>(
            'SELECT `Id`, `Name`, `AccessToken`, `UserId`, `LastAccessTime`, `LastAccessAddress` FROM `UserSession` WHERE `AccessToken` = ?', [accessToken]);
        if (!Array.isArray(rows) || rows.length == 0) {
            throw new MyError('auth', 'unauthorized');
        }
        userSessionStorage.push(rows[0]);
        session = rows[0];
    }

    if (dayjs.utc(session.LastAccessTime).add(30, 'day').isBefore(ctx.state.now)) {
        // check expires or update last access time
        await pool.execute('DELETE FROM `UserSession` WHERE `Id` = ? ', session.Id);
        userSessionStorage.splice(userSessionStorage.findIndex(d => d.Id == session.Id), 1);
        throw new MyError('auth', 'authorization expired');
    }

    // this means ctx.state.user.id must be in userStorage after pass authentication
    const user = await getUserById(session.UserId);
    if (!user.Active) {
        throw new MyError('auth', 'authorization inactive');
    }

    session.LastAccessTime = ctx.state.now.format(QueryDateTimeFormat.datetime);
    session.LastAccessAddress = ctx.socket.remoteAddress;
    await pool.query(
        'UPDATE `UserSession` SET `LastAccessTime` = ?, `LastAccessAddress` = ? WHERE `Id` = ?',
        [session.LastAccessTime, session.LastAccessAddress, session.Id]);

    ctx.state.user = { id: user.Id, name: user.Name, sessionId: session.Id, sessionName: session.Name };
}

// actions batch 2, special api used by id.example.com that require authenticate
const actions2: Router[] = [

// this is same as in actions4, 
// it is ok to duplicate because it is really small,
// it is available in both id.example.com and app.example.com
[/^GET \/user-credential$/,
async function handleGetUserCredential(ctx) {
    ctx.status = 200;
    ctx.body = ctx.state.user;
}],

[/^POST \/generate-authorization-code$/,
async function handleGenerateAuthorizationCode(ctx) {

    const returnAddress = (ctx.request.body as { return: string })?.return;
    if (!returnAddress) { throw new MyError('common', 'invalid return address'); }

    const app = Object.entries(webappconfig)
        .find(a => returnAddress.startsWith(a[1].small ? `https://app.example.com/${a[0]}` : `https://${a[0]}.example.com`))?.[0];
    if (!app) { throw new MyError('common', 'invalid return address'); }

    const code = generateRandomText(64);
    authorizationCodeStorage.push({
        userId: ctx.state.user.id,
        app,
        value: code,
        expireTime: ctx.state.now.add(1, 'minute'),
    });

    ctx.status = 200;
    ctx.body = { code };
}],

// use PATCH /user-credential instead of PATCH /users/:userid because I do not have /users related features
[/^PATCH \/user-credential$/,
async function handleUpdateUserName(ctx) {

    const newUserName = (ctx.request.body as { name: string })?.name;
    if (!newUserName) { throw new MyError('common', 'invalid new user name'); }

    const user = userStorage.find(u => u.Id == ctx.state.user.id);
    if (user.Name == newUserName) { ctx.status = 201; return; } // ignore no change but allow case change

    if (userStorage.some(u => u.Id != user.Id && !collator.compare(u.Name, newUserName))) {
        throw new MyError('common', 'user name already exists');
    } else {
        const [rows] = await pool.query<QueryResult<UserData>[]>(
            'SELECT `Id`, `Name`, `Active`, `Secret` FROM `User` WHERE `Id` <> ? AND `Name` = ?', [user.Id, newUserName]);
        if (Array.isArray(rows) && rows.length != 0) {
            userStorage.push(rows[0]);
            throw new MyError('common', 'user name already exists');
        }
    }

    user.Name = newUserName;
    await pool.execute('UPDATE `User` SET `Name` = ? WHERE `Id` = ?', [newUserName, user.Id]);

    ctx.status = 201;
}],

[/^GET \/user-sessions$/,
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
    })).concat(applicationAccessTokenStorage.map<UserSession>(a => ({
        app: a.app,
        lastAccessTime: a.lastAccessTime.toISOString(),
    })));
}],

[/^PATCH \/user-sessions\/(?<session_id>\d+)$/,
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

[/^DELETE \/user-sessions\/(?<session_id>\d+)$/,
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
];

// actions batch 3, special api for app.example.com before authenticate
const actions3: Router[] = [

// this is the OAuth/OIDC exchange access token
[/^GET \/user-credential$/,
async function handleExchangeAccessToken(ctx) {
    const code = getBearerAuthorization(ctx);

    const codeInfo = authorizationCodeStorage.find(c => c.value == code);
    if (!codeInfo) { throw new MyError('auth', 'invalid authorization code'); }
    // always remove from valid authorization codes
    authorizationCodeStorage.splice(authorizationCodeStorage.findIndex(c => c.value == code), 1);

    if (ctx.state.app != codeInfo.app || ctx.state.now.isAfter(codeInfo.expireTime)) {
        throw new MyError('auth', 'invalid authorization code');
    }
    
    const user = await getUserById(codeInfo.userId);
    if (!user.Active) {
        throw new MyError('auth', 'user is not active');
    }

    const accessToken = generateRandomText(42);
    applicationAccessTokenStorage.push({ userId: codeInfo.userId, app: codeInfo.app, value: accessToken, lastAccessTime: ctx.state.now });
    
    ctx.status = 200;
    ctx.body = { accessToken };
}],
];

// authenticate app.example.com, which is very different from authenticate id.example.com
async function authenticateApplication(ctx: AuthContext) {
    const accessToken = getBearerAuthorization(ctx);

    let session = applicationAccessTokenStorage.find(d => d.value == accessToken);
    if (!session) { throw new MyError('auth', 'unauthorized'); }

    if (session.app != ctx.state.app) {
        throw new MyError('auth', 'unauthorized');
    }
    if (dayjs.utc(session.lastAccessTime).add(30, 'day').isBefore(ctx.state.now)) {
        applicationAccessTokenStorage.splice(applicationAccessTokenStorage.findIndex(d => d.value == accessToken), 1);
        throw new MyError('auth', 'authorization expired');
    }

    const user = await getUserById(session.userId);
    if (!user.Active) {
        throw new MyError('auth', 'authorization inactive');
    }

    session.lastAccessTime = ctx.state.now;
    ctx.state.user = { id: user.Id, name: user.Name };
}

// actions batch 4, for app.example.com after authentication
const actions4: Router[] = [

// this is same as in actions2, 
// it is ok to duplicate because it is really small,
// it is available in both id.example.com and app.example.com
[/^GET \/user-credential$/,
async function handleGetUserCredential(ctx) {
    ctx.status = 200;
    ctx.body = ctx.state.user;
}],

[/^POST \/signout$/,
async function handleSignOut(ctx) {

    const sessionId = ctx.state.user.sessionId;
    const session = userSessionStorage.find(d => d.Id == sessionId);
    if (!session) {
        throw new MyError('common', 'invalid session id');
    }
    userSessionStorage.splice(userSessionStorage.findIndex(d => d.Id == sessionId), 1);
    await pool.execute('DELETE FROM `UserSession` WHERE `Id` = ?', [sessionId]);

    ctx.status = 204;
}],
];

// handle cors, because api.example.com does not have ui, all invocation here is cross origin
export async function handleRequestAccessControl(ctx: AuthContext, next: koa.Next): Promise<void> {
    if (ctx.subdomains[0] != 'api') { throw new MyError('unreachable'); }

    // rate limit all
    ratelimits.all.request(ctx.socket.remoteAddress);

    ctx.state.app =
        // use id (identity provider) for id.example.com
        ctx.origin == 'https://id.example.com' ? 'id'
        // this correctly handles multiple path segment and empty pathname, although empty pathname should not happen
        : ctx.origin == 'https://app.example.com' ? ctx.URL.pathname.split('/')[0]
        : Object.entries(webappconfig).find(a => !a[1].small && `https://${a[0]}.example.com` == ctx.origin)?.[0];

    // TODO validate request path be /app or /public/app

    // do not set access-control-* and let browser reject it
    if (!ctx.state.app) { return; }

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

export async function handleRequestAuthentication(ctx: AuthContext, next: koa.Next): Promise<any> {
    ctx.state.now = dayjs.utc();
    
    const key = `${ctx.method} ${ctx.path}`;

    if (ctx.origin == 'https://id.example.com') {
        for (const [regex, handler] of actions1) {
            const match = regex.exec(key);
            if (match) { await handler(ctx, match.groups); return; }
        }

        await authenticateIdentityProvider(ctx);

        for (const [regex, handler] of actions2) {
            const match = regex.exec(key);
            if (match) { await handler(ctx, match.groups); return; }
        }
    } else {
        for (const [regex, handler] of actions3) {
            const match = regex.exec(key);
            if (match) { await handler(ctx, match.groups); return; }
        }

        await authenticateApplication(ctx);

        for (const [regex, handler] of actions4) {
            const match = regex.exec(key);
            if (match) { await handler(ctx, match.groups); return; }
        }
    }

    return await next();
}

export async function handleAuthCommand(command: AdminAccessCommand): Promise<void> {
    log.info({ type: 'admin command auth', data: command });

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
