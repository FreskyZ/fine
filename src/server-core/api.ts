import { randomBytes } from 'crypto';
import * as bodyParser from 'body-parser';
import * as dayjs from 'dayjs';
import * as express from 'express';
import { authenticator } from 'otplib';
import { handleRequestError } from './error';
import type { UserClaim, User, UserCredential } from '../shared/types/auth';
import { DatabaseConnection } from '../shared/database';
import { APIError } from '../shared/error';

const allowedOrigins = [
    'https://domain.com',
    'https://www.domain.com',
    'https://cost.domain.com',
    'https://drive.domain.com',
];

type MyRequest = express.Request & { my: { 
    cookies: {
        AccessToken?: string,
        RefreshToken?: string, 
        [name: string]: string,
    },
    user?: UserCredential,
} }

// see docs/authentication.md
const controller = express.Router();

controller.use(bodyParser.json()); // application/json
controller.use(bodyParser.urlencoded({ // application/x-www-form-urlencoded
    extended: false, // use npm querystring package instead of qs package because extend feature is not used
}));

// parse cookie
controller.use(((request: MyRequest, _response, next) => {
    if (!request.my) {
        request.my = { cookies: {} };
    }

    if (!request.headers.cookie) {
        return next();
    }
    for (const item of request.headers.cookie.split(';').map(c => c.trim())) {
        if (!item.includes('=')) {
            continue;
        }
        const nameAndValue = item.split('=');
        if (nameAndValue.length != 2) {
            continue;
        }

        request.my.cookies[nameAndValue[0]] = nameAndValue[1];
    }
    next();
}) as express.RequestHandler);

// allow limited origin
controller.use((request, response, next) => {

    // ATTENTION ATTENTION TEMP ALLOW SELF
    if (!request.headers.origin) {
        return next();
    }
    if (request.headers.origin == 'https://api.domain.com') {
        return next();
    }

    if (!allowedOrigins.includes(request.headers['origin'])) {
        return response.status(200).end(); // return empty and let browser reject it
    }
    response
        .header('Vary', 'Origin')
        .header('Access-Control-Allow-Origin', request.headers['origin'])
        .header('Access-Control-Allow-Headers', 'Origin,Content-Type,Accept,Cookie')
        .header('Access-Control-Allow-Credentials', 'true'); // fetch({ credentials: 'include' }) says it need this
    next();
});

const baseCookieOptions: express.CookieOptions = { 
    secure: true, 
    httpOnly: true, 
    sameSite: 'none', 
    domain: 'domain.com', 
    encode: String // or else '/' in base64 will be encoded
};

controller.post('/login', async (request, response, next) => {
    if (!request.body.name) return next(new APIError('user name cannot be empty')); // amazingly that's how you throw error *to the error handler*
    if (!request.body.password) return next(new APIError('password cannot be empty'));
    const claim = request.body as UserClaim;

    const db = await DatabaseConnection.create();
    const { value } = await db.query(
        'SELECT Id, Name, AuthenticatorToken, AccessToken, AccessTokenDate, RefreshToken, RefreshTokenTime FROM `User` WHERE `Name` = ?', 
        claim.name);

    if (!Array.isArray(value) || value.length == 0) {
        return next(new APIError('unknonw user or incorrect password'));
    }

    const user = value[0] as Partial<User>;
    if (!authenticator.check(claim.password, user.AuthenticatorToken)) {
        // ATTENTION ATTENTION ATTENTION TEMP REMOVE PASSWORD VALIDATION HERE
        // return next(new APIError('unknown user or incorrect password'));
        // ATTENTION ATTENTION ATTENTION TEMP REMOVE PASSWORD VALIDATION HERE
    }

    // 42 is a arbitray number, because this is random token, not encoded something token
    // actually randomBytes(42) will be 56 chars after base64 encode, but there is no way to get exactly 42 characters after encode, so just use these parameters
    const refreshToken = randomBytes(42).toString('base64').slice(0, 42);
    const accessToken = randomBytes(42).toString('base64').slice(0, 42);
    const now = dayjs.utc();
    await db.query(
        'UPDATE `User` SET `RefreshToken` = ?, `RefreshTokenTime` = ?, `AccessToken` = ?, `AccessTokenDate` = ? WHERE `Id` = ?;',
        refreshToken, now.format('YYYY-MM-DD HH:mm:ss'), accessToken, now.format('YYYY-MM-DD'), user.Id);
    
    // login always generates new refresh token and access token and overwrites old one
    response
        .cookie('RefreshToken', refreshToken, { maxAge: 604800000, path: '/refresh-token', ...baseCookieOptions })
        .cookie('AccessToken', accessToken, { expires: now.hour(23).minute(59).second(59).millisecond(0).toDate(), ...baseCookieOptions })
        .header('Content-Type', 'application/json')
        .send(JSON.stringify({ id: user.Id, name: user.Name } as UserCredential))
        .status(200).end();
});

function create401(response: express.Response, message: string) {
    // clear cookie when 401 (e.g. invalidated before normal expire by server admin)
    response.status(401).header('Content-Type', 'text/plain').send(message).end();
}

controller.post('/refresh-token', (async (request: MyRequest, response: express.Response) => {
    if (!('RefreshToken' in request.my.cookies)) {
        return create401(response, 'no refresh token');
    }

    const db = await DatabaseConnection.create();
    const { value } = await db.query(
        'SELECT `Id`, `RefreshTokenTime` FROM `User` WHERE `RefreshToken` = ?',
        request.my.cookies['RefreshToken']);

    if (!Array.isArray(value) || value.length == 0) {
        return create401(response, 'unknown refresh token');
    }

    const user = value[0] as Partial<User>;
    if (dayjs.utc().isAfter(dayjs.utc(user.RefreshTokenTime).add(7, 'day'))) {
        await db.query(
            'UPDATE `User` SET `RefreshToken` = NULL, `RefreshTokenTime` = NULL, `AccessToken` = NULL, `AccessTokenDate` = NULL WHERE `Id` = ?',
            user.Id);
        return create401(response, 'expired refresh token');
    }

    const newAccessToken = randomBytes(42).toString('base64').slice(0, 42);
    const now = dayjs.utc();
    await db.query(
        'UPDATE `User` SET `AccessToken` = ?, `AccessTokenDate` = ? WHERE `Id` = ? ',
        newAccessToken, now.format('YYYY-MM-DD'), user.Id);

    // refresh token always generates new access token and overwrites old one
    response
        .cookie('AccessToken', newAccessToken, { expires: now.hour(23).minute(59).second(59).toDate(), ...baseCookieOptions })
        .status(200).end();
}) as unknown as express.RequestHandler);

// get user credential
// cache user crendentials to prevent db operation every api call
// entries live for one hour
const usercache: { token: string, tokenDate: dayjs.Dayjs, entryTime: dayjs.Dayjs, id: number, name: string }[] = [];
controller.use(((request: MyRequest, response, next) => (async () => {
    if (request.path == '/login' || request.path == '/refresh-token') return next();
    if (!('AccessToken' in request.my.cookies)) {
        return create401(response, 'no access token');
    }

    const db = await DatabaseConnection.create();

    const cachedUser = usercache.find(c => c.token == request.my.cookies['AccessToken']);
    if (cachedUser) {
        if (dayjs.utc().isAfter(cachedUser.entryTime.add(1, 'hour'))) { // cache invalidated
            usercache.splice(usercache.findIndex(c => c == cachedUser), 1);
        } else if (!dayjs.utc().isSame(cachedUser.tokenDate, 'date')) { // token expired
            console.log({ now: dayjs.utc(), cachedTokenDate: cachedUser.tokenDate });
            usercache.splice(usercache.findIndex(c => c == cachedUser), 1);
            db.query('UPDATE `User` SET `AccessToken` = NULL, `AccessTokenDate` = NULL WHERE `Id` = ?', cachedUser.id);
            return create401(response, 'expired access token');
        } else {
            request.my.user = { id: cachedUser.id, name: cachedUser.name }; // normal
            return next();
        }
    }

    const { value } = await db.query(
        'SELECT `Id`, `Name`, `AccessTokenDate` FROM `User` WHERE `AccessToken` = ?', 
        request.my.cookies['AccessToken']);
    
    if (!Array.isArray(value) || value.length == 0) {
        return create401(response, 'unknown access token');
    }

    const user = value[0] as Partial<User>;
    if (!dayjs.utc().isSame(dayjs.utc(user.AccessTokenDate), 'date')) {
        db.query('UPDATE `User` SET `AccessToken` = NULL, `AccessTokenDate` = NULL WHERE `Id` = ?', user.Id);
        return create401(response, 'expired access token');
    }

    usercache.push({ 
        token: request.my.cookies['AccessToken'], 
        tokenDate: dayjs.utc(user.AccessTokenDate),
        entryTime: dayjs.utc(),
        id: user.Id,
        name: user.Name,
    });
    request.my.user = { id: user.Id, name: user.Name };
    return next();
})().catch(next)) as express.RequestHandler); // manually cache rejection or else will terminate server process

controller.get('/user-credential', ((request: MyRequest, response: express.Response) => {
    response.send(JSON.stringify(request.my.user)).end(); // after previous middlewares, this handler itself is this simple
}) as unknown as express.RequestHandler);

controller.use((error: any, request: express.Request, response: express.Response, _next: express.NextFunction) => {
    handleRequestError(error, request);
    if (error instanceof APIError) { // return error message for known error
        response.status(400).send(JSON.stringify({ message: error.message })).end();
    } else {
        response.status(500).end();
    }
});

export { controller };
