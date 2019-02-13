import crypto from 'crypto';
import express from 'express';
import moment from 'moment';
import config from './config';
import DataContext from './data/context';

export class UserCredential {
    public constructor(
        public readonly id: number,
        public readonly loginId: string,
        public readonly name: string) {}
}

async function verifyPassword(loginId: string, password: string): Promise<string> {
    const context = await DataContext.create();

    const maybeDbUsers = await context.executeSql(
        'SELECT `Id`, `Salt`, `Password` FROM `User` WHERE `LoginId` = ?', loginId);
    if (maybeDbUsers.value.length == 0) {
        throw new Error('login id not exists');
    }

    const dbUser = maybeDbUsers.value[0];

    const hmac = crypto.createHmac('sha512', dbUser.Salt);
    hmac.update(password);
    if (hmac.digest().compare(dbUser.Password) != 0) {
        throw new Error('password not correct');
    }

    const token = crypto.randomBytes(64).toString('base64').slice(0, 42);
    await context.executeSql(
        'UPDATE `User` SET `Token` = ?, `TokenCreateTime` = ? WHERE Id = ?;', token, new Date(), dbUser.Id);

    return 'Bearer ' + token;
}

async function verifyToken(token: string): Promise<UserCredential> {
    const context = await DataContext.create();

    const maybeDbUsers = await context.executeSql(
        'SELECT `Id`, `LoginId`, `Name`, `TokenCreateTime` FROM `User` WHERE `Token` = ?', token);
    if (maybeDbUsers.value.length == 0) {
        throw new Error('invalid token');
    }

    const dbUser = maybeDbUsers.value[0];
    if (moment().isAfter(moment(dbUser.TokenCreateTime).add(config['token-expire']))) {
        throw new Error('token expired');
    }

    return new UserCredential(dbUser.Id, dbUser.LoginId, dbUser.Name);
}

declare global {
    namespace Express {
        interface Request {
            credential?: UserCredential;
        }
    }
}

type RouterNextFunction = express.IRouterHandler<express.Router> & express.IRouterMatcher<express.Router>;

export function requireAuth(
    request: express.Request, response: express.Response, next: RouterNextFunction) {
    const requestAuth = request.header('Authorization') as string;
    if (requestAuth.slice(0, 7) != 'Bearer ') {
        response.status(401).end();
    } else {
        const requestToken = requestAuth.slice(7);
        verifyToken(requestToken).then(credential => {
            request.credential = credential;
            next();
        }).catch(error => {
            response.send(error).end();
        });
    }
}

export function setup(app: express.Application): void {

    app.get('/token', async (request, response) => {
        const body = JSON.parse(request.body) as { username: string, password: string };
        const result = await verifyPassword(body.username, body.password);
        response.send({ token: result }).end();
    });
}
