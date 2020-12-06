import { randomBytes } from 'crypto';
import type * as cookies from 'cookies';
import * as url from 'url';
import * as dayjs from 'dayjs';
import * as koa from 'koa';
import { authenticator } from 'otplib';
import { config } from './config'; 
import { ErrorWithName } from './error';
import type { UserClaim, User, UserCredential, MyState } from '../shared/types/auth';
import { DatabaseConnection } from '../shared/database';

// see docs/authentication.md
// handle /login, /refresh-token, api.domain.com/user-credentials and api.domain.com/app/xxx

// cache user crendentials to prevent db operation every api call
// entries live for one hour
const usercache: { token: string, tokenDate: dayjs.Dayjs, entryTime: dayjs.Dayjs, id: number, name: string }[] = [];

const baseCookieOptions: cookies.SetOption = { secure: true, httpOnly: true, sameSite: 'none', domain: 'api.' + config.domain };

// POST /www/login
async function handleLogin(ctx: koa.Context) {

    if (ctx.get('Origin')) {
        // access control
        if (!allowedOrigins.includes(ctx.get('Origin'))) { return; } // do not set access-control-* and let browser reject it

        ctx.vary('Origin');
        ctx.set('Access-Control-Allow-Origin', ctx.get('Origin'));
        ctx.set('Access-Control-Allow-Credentials', 'true'); // fetch({ credentials: 'include' }) need this
        ctx.set('Access-Control-Allow-Methods', 'POST');
        ctx.set('Access-Control-Allow-Headers', 'X-Access-Token,Content-Type');
        if (ctx.method == 'OPTIONS') { ctx.status = 200; return; } // OPTIONS does not need furthur handling
    }

    if (!ctx.request.body || !ctx.request.body.name || !ctx.request.body.password) {
        throw new ErrorWithName('common-error', 'user name or password cannot be empty');
    }
    const claim = ctx.request.body as UserClaim;

    const db = await DatabaseConnection.create();
    const { value } = await db.query(
        'SELECT Id, Name, AuthenticatorToken, AccessToken, AccessTokenDate, RefreshToken, RefreshTokenTime FROM `User` WHERE `Name` = ?', claim.name);

    if (!Array.isArray(value) || value.length == 0) {
        throw new ErrorWithName('common-error', 'unknonw user or incorrect password');
    }

    const user = value[0] as Partial<User>;
    if (!authenticator.check(claim.password, user.AuthenticatorToken)) {
        throw new ErrorWithName('common-error', 'unknown user or incorrect password');
    }

    // use existing valid tokens if exist
    const now = dayjs.utc();
    const isRefreshTokenValid = now.isBefore(dayjs.utc(user.RefreshTokenTime).add(7, 'day'));
    const isAccessTokenValid = now.isSame(dayjs.utc(user.AccessTokenDate), 'date');

    // 42 is a arbitray number, because this is random token, not encoded something token
    // actually randomBytes(42) will be 56 chars after base64 encode, but there is no way to get exactly 42 characters after encode, so just use these parameters
    const refreshToken = isRefreshTokenValid ? user.RefreshToken : randomBytes(42).toString('base64').slice(0, 42);
    const accessToken = isAccessTokenValid ? user.AccessToken : randomBytes(42).toString('base64').slice(0, 42);
    if (!isRefreshTokenValid || !isAccessTokenValid) {
        await db.query(
            'UPDATE `User` SET `RefreshToken` = ?, `RefreshTokenTime` = ?, `AccessToken` = ?, `AccessTokenDate` = ? WHERE `Id` = ?;',
            refreshToken, now.format('YYYY-MM-DD HH:mm:ss'), accessToken, now.format('YYYY-MM-DD'), user.Id);
    }
    
    // update cache
    const cachedUser = usercache.find(c => c.id == user.Id);
    if (cachedUser) {
        cachedUser.token = accessToken;
        cachedUser.tokenDate = now;
        cachedUser.entryTime = now;
    } else {
        usercache.push({ token: accessToken, tokenDate: now, entryTime: now, id: user.Id, name: user.Name });
    }

    // browser seems to overwrite cookies with same name+domain+path
    ctx.cookies
        .set('RefreshToken', refreshToken, { maxAge: 604800000, path: '/refresh-token', ...baseCookieOptions })
        .set('AccessToken', accessToken, { expires: now.hour(23).minute(59).second(59).millisecond(0).toDate(), ...baseCookieOptions });
    ctx.type = 'json';
    ctx.body = JSON.stringify({ id: user.Id, name: user.Name } as UserCredential);
}

// POST /www/refresh-token
async function handleRefreshToken(ctx: koa.Context) {
    const refreshToken = ctx.cookies.get('RefreshToken');
    if (!refreshToken) {
        throw new ErrorWithName('auth-error', 'no-refresh-token');
    }

    const db = await DatabaseConnection.create();
    const { value } = await db.query('SELECT `Id`, `Name`, `RefreshTokenTime`, `AccessToken`, `AccessTokenDate` FROM `User` WHERE `RefreshToken` = ?', refreshToken);
    if (!Array.isArray(value) || value.length == 0) {
        throw new ErrorWithName('auth-error', 'unknown refresh token');
    }

    const user = value[0] as Partial<User>;
    if (dayjs.utc().isAfter(dayjs.utc(user.RefreshTokenTime).add(7, 'day'))) {
        await db.query(
            'UPDATE `User` SET `RefreshToken` = NULL, `RefreshTokenTime` = NULL, `AccessToken` = NULL, `AccessTokenDate` = NULL WHERE `Id` = ?', user.Id);
        throw new ErrorWithName('auth-error', 'expired refresh token');
    }

    // use existing valid access token if exist
    const now = dayjs.utc();
    const isAccessTokenValid = now.isSame(dayjs.utc(user.AccessTokenDate), 'date');

    const accessToken = isAccessTokenValid ? user.AccessToken : randomBytes(42).toString('base64').slice(0, 42);
    if (!isAccessTokenValid) {
        await db.query(
            'UPDATE `User` SET `AccessToken` = ?, `AccessTokenDate` = ? WHERE `Id` = ? ', accessToken, now.format('YYYY-MM-DD'), user.Id);
    }

    // update cache
    const cachedUser = usercache.find(c => c.id == user.Id);
    if (cachedUser) {
        cachedUser.token = accessToken;
        cachedUser.tokenDate = now;
        cachedUser.entryTime = now;
    } else {
        usercache.push({ token: accessToken, tokenDate: now, entryTime: now, id: user.Id, name: user.Name });
    }

    ctx.cookies
        .set('AccessToken', accessToken, { expires: now.hour(23).minute(59).second(59).toDate(), ...baseCookieOptions });
    ctx.status = 200;
}

const requireAuthConfig: { [app: string]: boolean } = { 'www': true, 'ak': false, 'cost': true, 'collect': true };
const allowedOrigins = [`https://${config.domain}`, `https://www.${config.domain}`].concat(config.apps.map(app => `https://${app}.${config.domain}`));

// GET /api/.+
async function handleCommonAuthentication(ctx: koa.ParameterizedContext<{ user: UserCredential }>, next: koa.Next) {
    // access control
    if (!allowedOrigins.includes(ctx.get('Origin'))) { return; } // do not set access-control-* and let browser reject it

    ctx.vary('Origin');
    ctx.set('Access-Control-Allow-Origin', ctx.get('Origin'));
    ctx.set('Access-Control-Allow-Credentials', 'true'); // fetch({ credentials: 'include' }) need this
    ctx.set('Access-Control-Allow-Methods', 'GET,HEAD,POST,PUT,DELETE,PATCH');
    ctx.set('Access-Control-Allow-Headers', 'X-Access-Token');
    if (ctx.method == 'OPTIONS') { ctx.status = 200; return; } // OPTIONS does not need furthur handling

    // check need authentication
    const originSubdomains = new url.URL(ctx.get('Origin')).hostname.split('.'); // request origin already verified and is in known list
    const originAppName = originSubdomains.length == 2 ? 'www' : originSubdomains[0];
    if (!requireAuthConfig[originAppName]) { return await next(); } // continue to allow annonymous api

    // validate access token
    const accessToken = ctx.cookies.get('AccessToken') || ctx.get('X-Access-Token');
    if (!accessToken) {
        throw new ErrorWithName('auth-error', 'no access token');
    }

    const db = await DatabaseConnection.create();

    const cachedUser = usercache.find(c => c.token == accessToken);
    if (cachedUser) {
        if (dayjs.utc().isAfter(cachedUser.entryTime.add(1, 'hour'))) { // cache invalidated
            usercache.splice(usercache.findIndex(c => c == cachedUser), 1);
            // continue to load db
        } else if (!dayjs.utc().isSame(cachedUser.tokenDate, 'date')) { // token expired
            usercache.splice(usercache.findIndex(c => c == cachedUser), 1);
            db.query('UPDATE `User` SET `AccessToken` = NULL, `AccessTokenDate` = NULL WHERE `Id` = ?', cachedUser.id);
            throw new ErrorWithName('auth-error', 'expired access token');
        } else {
            ctx.state.user = { id: cachedUser.id, name: cachedUser.name }; // normal
            return await next(); // continue to api
        }
    }

    const { value } = await db.query(
        'SELECT `Id`, `Name`, `AccessTokenDate` FROM `User` WHERE `AccessToken` = ?', accessToken);
    if (!Array.isArray(value) || value.length == 0) {
        throw new ErrorWithName('auth-error', 'unknown access token');
    }

    const user = value[0] as Partial<User>;
    if (!dayjs.utc().isSame(dayjs.utc(user.AccessTokenDate), 'date')) {
        db.query('UPDATE `User` SET `AccessToken` = NULL, `AccessTokenDate` = NULL WHERE `Id` = ?', user.Id);
        throw new ErrorWithName('auth-error', 'expired access token');
    }

    usercache.push({ 
        token: accessToken, 
        tokenDate: dayjs.utc(user.AccessTokenDate),
        entryTime: dayjs.utc(),
        id: user.Id,
        name: user.Name,
    });
    ctx.state.user = { id: user.Id, name: user.Name };
    await next(); // continue to api
}

export async function handleRequestAuthentication(ctx: koa.ParameterizedContext<MyState>, next: koa.Next) {
    // /login and /refresh-token is on /www/ because you cannot cross origin set cookie
    if (ctx.method == 'POST' && (ctx.subdomains.length == 0 || ctx.subdomains[0] == 'www') && ctx.path == '/login') { await handleLogin(ctx); return; }
    if (ctx.method == 'POST' && (ctx.subdomains.length == 0 || ctx.subdomains[0] == 'www') && ctx.path == '/refresh-token') { await handleRefreshToken(ctx); return; }
    if ((ctx.method == 'POST' || ctx.method == 'OPTIONS') && (ctx.subdomains.length == 1 && ctx.subdomains[0] == 'api') && ctx.path == '/login') { await handleLogin(ctx); return; }
    if ((ctx.method == 'POST' || ctx.method == 'OPTIONS') && (ctx.subdomains.length == 1 && ctx.subdomains[0] == 'api') && ctx.path == '/refresh-token') { await handleRefreshToken(ctx); return; }

    if (ctx.subdomains.length == 1 && ctx.subdomains[0] == 'api') { await handleCommonAuthentication(ctx, next); }
    else { await next(); } // else should be unreachable according to existing routing setups
}

export async function handleApp(ctx: koa.ParameterizedContext<MyState>, next: koa.Next) {
    if (ctx.subdomains.length != 0 && ctx.subdomains[0] != 'api') { return await next(); } // this should be unreachable according to existing routing setups

    if (ctx.method == 'GET' && ctx.path == '/user-credential') {
        ctx.type = 'json';
        ctx.body = JSON.stringify(ctx.state.user);
    } else {
        // TODO: link app server
        await next();
    }
}
