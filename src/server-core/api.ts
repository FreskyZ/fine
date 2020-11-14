import { randomBytes } from 'crypto';
import * as bodyParser from 'body-parser';
import * as express from 'express';
import { authenticator } from 'otplib';
import { handleRequestError } from './error';
import type { UserClaim, DUser } from '../shared/types/auth';
import { DatabaseConnection } from '../shared/database';
import { APIError } from '../shared/error';

// see docs/authentication.md
const controller = express.Router();

controller.use(bodyParser.json()); // application/json
controller.use(bodyParser.urlencoded({ // application/x-www-form-urlencoded
    extended: false, // use npm querystring package instead of qs package because extend feature is not used
}));

controller.post('/login', async (request, response, next) => {
    if (!request.body.name) return next(new APIError('user name cannot be empty')); // amazingly that's how you throw error *to the error handler*
    if (!request.body.password) return next(new APIError('password cannot be empty'));
    const claim = request.body as UserClaim;

    const db = await DatabaseConnection.create();
    const { value } = await db.query('SELECT AuthenticatorToken FROM `User` WHERE `Name` = ?', claim.name);

    if (!Array.isArray(value) || value.length == 0) {
        return next(new APIError('unknonw user or incorrect password'));
    }

    const user = value[0] as Partial<DUser>;
    if (!authenticator.check(claim.password, user.AuthenticatorToken)) {
        return next(new APIError('unknown user or incorrect password'));
    }

    const refreshToken = randomBytes(42).toString('base64').slice(0, 42);
    console.log(refreshToken);

    // login always set RefreshToken and clear AccessToken regardless of existence
    response.status(200).end();
});

controller.use((error: any, request: express.Request, response: express.Response, _next: express.NextFunction) => {
    handleRequestError(error, request);
    if (error instanceof APIError) { // return error message for known error
        response.status(400).send(JSON.stringify({ message: error.message })).end();
    } else {
        response.status(500).end();
    }
});

const controller2 = express.Router(); // disable because not fully implemented
export { controller2 as controller };
