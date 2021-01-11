/// <reference path="../shared/types/config.d.ts" />
import { randomBytes } from 'crypto';
import * as dayjs from 'dayjs';
import * as koa from 'koa';
import { authenticator } from 'otplib';
import * as qrcode from 'qrcode';
import type { AdminServerCoreAuthCommand } from '../shared/types/admin';
import type { UserClaim, UserCredential, UserData, UserDeviceData } from '../shared/types/auth';
import { query, QueryResult, QueryDateTimeFormat } from '../shared/database';
import { MyError } from '../shared/error';
import { logInfo } from './logger';

// see docs/authentication.md
// handle sign in, sign out, sign up and user info requests, and dispatch app api

export interface ContextState { now: dayjs.Dayjs, app: string, user: UserCredential }
type Ctx = koa.ParameterizedContext<ContextState>;

// app related config
const requireAuthConfig: { [app: string]: boolean } = { 'www': true, 'ak': false, 'wimm': true, 'collect': true };
const allowedOriginConfig = APP_NAMES.concat(['www']).reduce<{ [origin: string]: string }>(
    (acc, app) => { acc[`https://${app}.domain.com`] = app; return acc; }, { [`https://domain.com`]: 'www' });

// cache user crendentials to prevent db operation every api call
// entries will not expire, because I should and will not directly update db User and UserDevice table
const userStorage: UserData[] = [];
const userDeviceStorage: UserDeviceData[] = [];

// ignore case comparator, this may need to be moved to some utility module
const collator = Intl.Collator('en', { sensitivity: 'base' });

let AllowSignUp = false;
let AllowSignUpTimer: NodeJS.Timeout; // similar to some other features, sign up is timeout disabled after 12 hours if not manually disabled or reenabled

// called by signin and signup, return access token
async function createUserDevice(ctx: Ctx, userId: number): Promise<{ accessToken: string }> {
    // NOTE: 42 is a arbitray number, because this is random token, not encoded something token
    // actually randomBytes(42) will be 56 chars after base64 encode, but there is no way to get exactly 42 characters after encode, so just use these parameters
    const accessToken = randomBytes(42).toString('base64').slice(0, 42);
    const userDevice: UserDeviceData = { Id: 0, App: ctx.state.app, Name: '<unnamed>', Token: accessToken, UserId: userId, LastAccessTime: ctx.state.now.format(QueryDateTimeFormat.datetime) };
    const { value: { insertId: userDeviceId } } = await query<QueryResult>(
        'INSERT INTO `UserDevice` (`App`, `Name`, `Token`, `UserId`, `LastAccessTime`) VALUES (?, ?, ?, ?, ?)',
        userDevice.App, userDevice.Name, userDevice.Token, userDevice.UserId, userDevice.LastAccessTime);
    userDevice.Id = userDeviceId!;
    userDeviceStorage.push(userDevice);

    return { accessToken };
}

// use regex to dispatch special apis
// // this makes the usage looks like c# property/java annotation/python annotation/typescript metadata
type Matcher = [RegExp, (ctx: Ctx, parameters: Record<string, string>) => Promise<void>];

const matchers1: Matcher[] = [ // special apis before authenticate

[/^POST \/signin$/,
async function handleSignIn(ctx) {

    const claim: UserClaim = { username: ctx.get('X-Name'), password: ctx.get('X-Token') };
    if (!claim.username || !claim.password) {
        throw new MyError('common', 'user name or password cannot be empty');
    }

    const user = userStorage.find(u => !collator.compare(u.Name, claim.username)) ?? await (async () => {
        const { value } = await query<UserData[]>('SELECT `Id`, `Name`, `Token` FROM `User` WHERE `Name` = ?', claim.username);
        if (!Array.isArray(value) || value.length == 0) {
            throw new MyError('common', 'unknonw user or incorrect password');
        }
        const user: UserData = { Id: value[0].Id, Name: value[0].Name, Token: value[0].Token };
        userStorage.push(user);
        return user;
    })();

    if (!authenticator.check(claim.password, user.Token)) {
        throw new MyError('common', 'unknown user or incorrect password');
    }

    const accessToken = await createUserDevice(ctx, user.Id);

    ctx.status = 200;
    ctx.body = accessToken; // another 'it's for safety so limited' issue is that fetch cross origin response header is limited, so can only send by response body
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
        throw new MyError('common', 'invalid user name');
    }

    const secret = authenticator.generateSecret();
    const text = `otpauth://totp/domain.com:${username}?secret=${secret}&period=30&digits=6&algorithm=SHA1&issuer=domain.com`;
    const dataurl = await qrcode.toDataURL(text, { type: 'image/webp' });

    ctx.status = 200;
    ctx.body = { secret, dataurl };
}],

[/^POST \/signup/,
async function handleRegister(ctx) {
    if (!AllowSignUp) { throw new MyError('not-found', 'invalid invocation'); } // makes it look like normal unknown api

    const username = ctx.get('X-Name');
    if (!username) {
        throw new MyError('common', 'user name cannot be empty');
    }
    const rawpassword = ctx.get('X-Token');
    if (!rawpassword.includes(':')) {
        throw new MyError('common', 'invalid token format');
    }
    const [token, password] = rawpassword.split(':');
    if (!token || !password) {
        throw new MyError('common', 'invalid token format');
    }

    if (!authenticator.check(password, token)) {
        throw new MyError('common', 'incorrect password');
    }

    const { value } = await query<QueryResult>('INSERT INTO `User` (`Name`, `Token`) VALUES (?, ?)', username, token);
    const user: UserData = { Id: value.insertId, Name: username, Token: token };
    userStorage.push(user);

    const accessToken = await createUserDevice(ctx, user.Id);

    ctx.status = 201;
    ctx.body = accessToken;
}]];

// read X-Token and save user credential to ctx.state is needed by all functions accept sign in
async function authenticate(ctx: Ctx) {
    if (!requireAuthConfig[ctx.state.app]) { return; } // ignore allow annoymous

    const accessToken = ctx.get('X-Token');
    if (!accessToken) { throw new MyError('auth', 'unauthorized'); }

    const userDevice = userDeviceStorage.find(d => d.Token == accessToken) ?? await (async () => {
        const { value } = await query<UserDeviceData[]>('SELECT `Id`, `App`, `Name`, `Token`, `UserId`, `LastAccessTime` FROM `UserDevice` WHERE `Token` = ?', accessToken);
        if (!Array.isArray(value) || value.length == 0) {
            throw new MyError('auth', 'unauthorized');
        }
        userDeviceStorage.push(value[0]);
        return value[0];
    })();

    if (userDevice.App != ctx.state.app) {
        // actually this will only happen when I manually copy token from db or from other app
        // but need to be checked anyway
        throw new MyError('auth', 'unauthorized');
    }
    if (dayjs.utc(userDevice.LastAccessTime).add(30, 'day').isBefore(ctx.state.now)) {
        // check expires or update last access time
        await query('DELETE FROM `UserDevice` WHERE `Id` = ? ', userDevice.Id);
        userDeviceStorage.splice(userDeviceStorage.findIndex(d => d.Id == userDevice.Id), 1);
        throw new MyError('auth', 'authorization expired');
    }

    userDevice.LastAccessTime = ctx.state.now.format(QueryDateTimeFormat.datetime);
    await query('UPDATE `UserDevice` SET `LastAccessTime` = ? WHERE `Id` = ?', userDevice.LastAccessTime, userDevice.Id);

    const user = userStorage.find(u => u.Id == userDevice.UserId) ?? await (async () => {
        const { value } = await query<UserData[]>('SELECT `Id`, `Name`, `Token` FROM `User` WHERE `Id` = ?', userDevice.UserId);
        const user: UserData = { Id: value[0].Id, Name: value[0].Name, Token: value[0].Token };
        userStorage.push(user);
        return user;
    })();

    ctx.state.user = { id: user.Id, name: user.Name, deviceId: userDevice.Id, deviceName: userDevice.Name };
}

const matchers2: Matcher[] = [ // special apis after authenticate

[/^GET \/user-devices$/,
async function handleGetUserDevices(ctx) {
    // you always cannot tell whether all devices already loaded from db (unless new runtime memory storage added)
    // so always load from db and replace user device storage

    const { value: userDevices } = await query<UserDeviceData[]>(
        'SELECT `Id`, `App`, `Name`, `Token`, `UserId`, `LastAccessTime` FROM `UserDevice` WHERE `UserId` = ? AND `App` = ?', ctx.state.user.id, ctx.state.app);

    // update storage
    // // this is how you filter by predicate in place
    while (userDeviceStorage.some(d => d.UserId == ctx.state.user.id)) {
        userDeviceStorage.splice(userDeviceStorage.findIndex(d => d.UserId == ctx.state.user.id), 1);
    }
    userDeviceStorage.push(...userDevices);

    ctx.status = 200;
    ctx.body = userDevices.map(d => ({ id: d.Id, name: d.Name }));
}],

[/^PATCH \/user-devices\/(?<device_id>\d+)$/,
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

    if (userDevice.UserId != ctx.state.user.id) {
        throw new MyError('common', 'not my device');
    }
    if (userDevice.App != ctx.state.app) { // cannot manage other app's device
        throw new MyError('common', 'not my device');
    }

    userDevice.Name = newDeviceName;
    await query('UPDATE `UserDevice` SET `Name` = ? WHERE `Id` = ?', newDeviceName, deviceId);

    ctx.status = 201;
    ctx.body = { id: userDevice.Id, name: userDevice.Name };
}],

[/^DELETE \/user-devices\/(?<device_id>\d+)$/,
async function handleRemoveDevice(ctx, parameters) {

    const deviceId = parseInt(parameters['device_id']);
    if (isNaN(deviceId) || deviceId == 0) { throw new MyError('common', 'invalid device id'); }

    // if the request fail by common error, add it to cache helps later request
    const userDevice = userDeviceStorage.find(d => d.Id == deviceId) ?? await (async () => {
        const { value } = await query<UserDeviceData[]>('SELECT `Id`, `App`, `Name`, `Token`, `UserId`, `LastAccessTime` FROM `UserDevice` WHERE `Id` = ?', deviceId);
        if (!Array.isArray(value) || value.length == 0) {
            throw new MyError('common', 'invalid device id');
        }
        userDeviceStorage.push(value[0]);
        return value[0];
    })();

    if (userDevice.UserId != ctx.state.user.id) {
        throw new MyError('common', 'not my device');
    }
    if (userDevice.App != ctx.state.app) {
        throw new MyError('common', 'not my device');
    }

    userDeviceStorage.splice(userDeviceStorage.findIndex(d => d.Id == deviceId), 1);
    await query('DELETE FROM `UserDevice` WHERE `Id` = ?', deviceId);

    ctx.status = 204;
}],

/* eslint-disable require-await */
[/^GET \/user-credential$/,
async function handleGetUserCredential(ctx) {
    ctx.status = 200;
    ctx.body = ctx.state.user;
}]];
/* eslint-enable require-await */

export async function handleRequestAccessControl(ctx: Ctx, next: koa.Next): Promise<void> {
    if (ctx.subdomains[0] != 'api') { throw new MyError('unreachable'); }
    // all functions need access control because all of them are called cross origin (from app.domain.com to api.domain.com)

    const origin = ctx.get('origin');
    if (!(origin in allowedOriginConfig)) { return; } // do not set access-control-* and let browser reject it

    ctx.vary('Origin');
    ctx.set('Access-Control-Allow-Origin', origin);
    ctx.set('Access-Control-Allow-Methods', 'GET,HEAD,POST,PUT,DELETE,PATCH');
    ctx.set('Access-Control-Allow-Headers', 'Content-Type,X-Name,X-Token');
    if (ctx.method == 'OPTIONS') { ctx.status = 200; return; } // handling of OPTIONS is finished here

    ctx.state.app = allowedOriginConfig[origin];
    await next();
}

export async function handleRequestAuthentication(ctx: Ctx, next: koa.Next): Promise<any> {
    ctx.state.now = dayjs.utc();
    const key = `${ctx.method} ${ctx.path}`;

    for (const [regex, handler] of matchers1) {
        const match = regex.exec(key);
        if (match) { await handler(ctx, match.groups!); return; }
    }

    await authenticate(ctx);

    for (const [regex, handler] of matchers2) {
        const match = regex.exec(key);
        if (match) { await handler(ctx, match.groups!); return; }
    }

    return await next();
}

export async function handleApplications(ctx: Ctx): Promise<void> {
    if (!ctx.state.app) { throw new MyError('unreachable'); }

    for (const app of APP_NAMES) {
        if (new RegExp('^/' + app).test(ctx.path)) {

            let dispatch: (ctx: Ctx) => Promise<void>;
            try {
                // always re-require, for hot reloading
                // this require expression is ignored by both tsc and mypack, see docs/build-script
                dispatch = require(`./${app}/server`).dispatch;
            } catch {
                throw new MyError('unreachable');
            }
            if (typeof dispatch !== 'function') {
                throw new MyError('unreachable');
            }

            return await dispatch(ctx);
        }
    }

    throw new MyError('not-found', 'invalid invocation');
}

export async function handleCommand(command: AdminServerCoreAuthCommand): Promise<void> {
    logInfo({ type: 'admin command auth', data: command });

    if (command.type == 'reload-server') {
        delete require.cache[require.resolve(`./${command.app}/server`)];
    } else if (command.type == 'remove-device') {
        await query('DELETE FROM `UserDevice` WHERE `Id` = ?', command.deviceId);
        userDeviceStorage.splice(userDeviceStorage.findIndex(d => d.Id == command.deviceId), 1);
    } else if (command.type == 'enable-signup') {
        AllowSignUp = true;
        if (AllowSignUpTimer) { clearTimeout(AllowSignUpTimer); }
        AllowSignUpTimer = setTimeout(() => AllowSignUp = false, 43200_000);
    } else if (command.type == 'disable-signup') {
        AllowSignUp = false;
        if (AllowSignUpTimer) { clearTimeout(AllowSignUpTimer); }
    } // other not supported for now
}
