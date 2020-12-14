import { randomBytes } from 'crypto';
import * as dayjs from 'dayjs';
import type * as _ from 'dayjs/plugin/utc'; // vscode need this to prevent warning
import * as koa from 'koa';
import { authenticator } from 'otplib';
import type { UserClaim, UserCredential, UserData, UserDeviceData } from '../shared/types/auth';
import { query, QueryResult, QueryDateTimeFormat } from '../shared/database';
import { MyError } from '../shared/error';

// see docs/authentication.md
// handle common login and user info requests, and dispatch app api

// these additional state actually only used in api
export interface ContextState { now: dayjs.Dayjs, app: string, user: UserCredential }
type Ctx = koa.ParameterizedContext<ContextState>;

// app related config
const requireAuthConfig: { [app: string]: boolean } = { 'www': true, 'ak': false, 'cost': true, 'collect': true };
const allowedOriginConfig: { [origin: string]: string } = APP_NAMES.reduce<{ [origin: string]: string }>(
    (acc, app) => { acc[`https://${app}.${DOMAIN_NAME}`] = app; return acc; }, 
    { [`https://${DOMAIN_NAME}`]: 'www', [`https://www.${DOMAIN_NAME}`]: 'www' });

// cache user crendentials to prevent db operation every api call
// entries will not expire, because I should and will not directly update db User and UserDevice table
const userStorage: UserData[] = [];
const userDeviceStorage: UserDeviceData[] = [];

// ignore case comparator, this may need to be moved to some utility module
const collator = Intl.Collator('en', { sensitivity: 'base' });

const loginRegex = /POST \/login$/; 
async function handleLogin(ctx: Ctx) {

    // reuse x-access-token for password // actually authenticator token is also a kind of access token
    const claim: UserClaim = { username: ctx.get('X-Name'), password: ctx.get('X-Access-Token') };
    if (!claim.username || !claim.password) {
        throw new MyError('common', 'user name or password cannot be empty');
    }

    const user = userStorage.find(u => collator.compare(u.Name, claim.username)) ?? await (async () => {
        const { value } = await query<UserData[]>('SELECT `Id`, `Name`, `Token` FROM `User` WHERE `Name` = ?', claim.username);
        if (!Array.isArray(value) || value.length == 0) {
            throw new MyError('common', 'unknonw user or incorrect password');
        }
        userStorage.push(value[0]);
        return value[0];
    })();

    if (!authenticator.check(claim.password, user.Token)) {
        throw new MyError('common', 'unknown user or incorrect password');
    }

    // login always create new device
    // 42 is a arbitray number, because this is random token, not encoded something token
    // actually randomBytes(42) will be 56 chars after base64 encode, but there is no way to get exactly 42 characters after encode, so just use these parameters
    const accessToken = randomBytes(42).toString('base64').slice(0, 42);
    const userDevice: UserDeviceData = { Id: 0, App: ctx.state.app, Name: '<unnamed>', Token: accessToken, UserId: user.Id, LastAccessTime: ctx.state.now.format(QueryDateTimeFormat.datetime) };
    const { value: { insertId: userDeviceId } } = await query<QueryResult>(
        'INSERT INTO `UserDevice` (`App`, `Name`, `Token`, `UserId`, `LastAccessTime`) VALUES (?, ?, ?, ?, ?)',
        userDevice.App, userDevice.Name, userDevice.Token, userDevice.UserId, userDevice.LastAccessTime);
    userDevice.Id = userDeviceId;
    userDeviceStorage.push(userDevice);

    ctx.status = 200;
    ctx.set('X-Access-Token', accessToken);
}

// read X-Access-Token and save user credential to ctx.state is needed by all functions accept login
async function authenticate(ctx: Ctx) {
    if (!requireAuthConfig[ctx.state.app]) { return; } // ignore allow annoymous
    if (!ctx.get('X-Access-Token')) { throw new MyError('auth', 'unauthorized'); }

    const accessToken = ctx.get('X-Access-Token');
    const userDevice = userDeviceStorage.find(d => d.Token == accessToken) ?? await (async () => {
        const { value } = await query<UserDeviceData[]>('SELECT `Id`, `App`, `Name`, `Token`, `UserId`, `LastAccessTime` FROM `UserDevice` WHERE `Token` = ?', accessToken);
        if (!Array.isArray(value) || value.length == 0) {
            throw new MyError('auth', 'unauthorized');
        }
        userDeviceStorage.push(value[0]);
        return value[0];
    })();

    // check expires or update last access time
    if (dayjs.utc(userDevice.LastAccessTime).add(30, 'day').isBefore(ctx.state.now)) {
        await query('DELETE FROM `UserDevice` WHERE `Id` = ? ', userDevice.Id);
        userDeviceStorage.splice(userDeviceStorage.findIndex(d => d.Id == userDevice.Id), 1);
        throw new MyError('auth', 'authorization expired');
    } else {
        userDevice.LastAccessTime = ctx.state.now.format(QueryDateTimeFormat.datetime);
        await query('UPDATE `UserDevice` SET `LastAccessTime` = ? WHERE `Id` = ?', userDevice.LastAccessTime, userDevice.Id);
    }

    const user = userStorage.find(u => u.Id = userDevice.UserId) ?? await (async () => {
        const { value } = await query<UserData[]>('SELECT `Id`, `Name`, `Token` FROM `User` WHERE `Id` = ?', userDevice.UserId);
        userStorage.push(value[0]); // db foreign key constraint will make this correct
        return value[0];
    })();

    ctx.state.user = { id: user.Id, name: user.Name, deviceId: userDevice.Id, deviceName: userDevice.Name };
}

// use regex to dispatch user and device handlers
// now this format looks very like c# property/java annotation/python annotation/typescript metadata
const matchers: [RegExp, (ctx: Ctx, parameters: Record<string, string>) => Promise<void>][] = [

[/GET \/user-devices$/,
async function handleGetUserDevices(ctx) {
    // you always cannot tell whether all devices already loaded from db (unless new runtime memory storage added)
    // so always load from db and replace user device storage

    const { value: userDevices } = await query<UserDeviceData[]>(
        'SELECT `Id`, `App`, `Name`, `Token`, `UserId`, `LastAccessTime` FROM `UserDevice` WHERE `UserId` = ?', ctx.state.user.id);
    
    // update storage
    // // this is how you filter by predicate in place
    while (userDeviceStorage.some(d => d.UserId == ctx.state.user.id)) {
        userDeviceStorage.splice(userDeviceStorage.findIndex(d => d.UserId == ctx.state.user.id), 1);
    }
    userDeviceStorage.push(...userDevices);

    ctx.status = 200;
    ctx.body = userDevices.map(d => ({ id: d.Id, name: d.Name }));
}],

[/PATCH \/user-device\/(?<device_id>\d+)$/,
async function handleUpdateDeviceName(ctx, parameters) {

    const deviceId = parseInt(parameters['device_id']);
    if (isNaN(deviceId) || deviceId == 0) { throw new MyError('common', 'invalid device id'); }

    const newDeviceName = ctx.request.body?.name;
    if (!newDeviceName) { throw new MyError('common', 'invalid new device name'); }

    const userDevice = userDeviceStorage.find(d => d.Id == deviceId) ?? await (async () => {
        const { value } = await query<UserDeviceData[]>('SELECT `Id`, `App`, `Name`, `Token`, `UserId`, `LastAccessTime` FROM `UserDevice` WHERE `Id` = ?', deviceId);
        if (!Array.isArray(value) || value.length == 0) {
            throw new MyError('common', 'invalid device id');
        }
        userDeviceStorage.push(value[0]);
        return value[0];
    })();

    userDevice.Name = newDeviceName;
    await query('UPDATE `UserDevice` SET `Name` = ? WHERE `Id` = ?', newDeviceName, deviceId);

    ctx.status = 201;
    ctx.body = { id: userDevice.Id, name: userDevice.Name };
}],

[/DELETE \/user-device\/(?<device_id>\d+)$/,
async function handleRemoveDevice(ctx, parameters) {

    const deviceId = parseInt(parameters['device_id']);
    if (isNaN(deviceId) || deviceId == 0) { throw new MyError('common', 'invalid device id'); }

    const maybeStorageIndex = userDeviceStorage.findIndex(d => d.Id == deviceId);
    if (maybeStorageIndex >= 0) { userDeviceStorage.splice(maybeStorageIndex, 1); }

    await query('DELETE FROM `UserDevice` WHERE `Id` = ?', deviceId);

    ctx.status = 204;
}],

[/GET \/user-credential$/,
async function handleGetUserCredential(ctx) {
    ctx.status = 200;
    ctx.body = ctx.state.user;
}]];

export async function handleRequestAccessControl(ctx: Ctx, next: koa.Next) {
    if (ctx.subdomains[0] != 'api') { throw new MyError('unreachable'); }
    // all functions need access control because all of them are called cross origin (from app.domain.com to api.domain.com)

    const origin = ctx.get('origin');
    if (!(origin in allowedOriginConfig)) { return; } // do not set access-control-* and let browser reject it

    ctx.vary('Origin');
    ctx.set('Access-Control-Allow-Origin', origin);
    ctx.set('Access-Control-Allow-Methods', 'GET,HEAD,POST,PUT,DELETE,PATCH');
    ctx.set('Access-Control-Allow-Headers', 'Content-Type,X-Name,X-Access-Token');
    if (ctx.method == 'OPTIONS') { ctx.status = 200; return; } // handling of OPTIONS is finished here

    ctx.state.app = allowedOriginConfig[origin];
    await next();
}

export async function handleRequestAuthentication(ctx: Ctx, next: koa.Next) {
    ctx.state.now = dayjs.utc();

    const key = `${ctx.method} ${ctx.path}`;
    if (loginRegex.test(key)) { await handleLogin(ctx); return; }

    await authenticate(ctx);

    for (const [regex, handler] of matchers) {
        const match = regex.exec(key);
        if (match) { await handler(ctx, match.groups); return; }
    }

    return await next();
}

export async function handleApplications(ctx: Ctx) {
    if (!ctx.state.app) { throw new MyError('unreachable'); }
    
    for (const app of APP_NAMES) {
        if (new RegExp('^/' + app).test(ctx.path)) {
            // NOTE:
            // always re-require, for hot reloading
            // tsc recognizes import statement and this require auto ignored 
            // build script recognizes "require('." and this string template auto ignored
            await (require(`../${app}/server`).dispatch as (ctx: Ctx) => Promise<void>)(ctx);
            return;
        }
    }

    throw new MyError('not-found', 'invalid invocation');
}

export function handleAdminReloadAppServer(app: string) {
    delete require.cache[require.resolve(`../${app}/server`)];
}
