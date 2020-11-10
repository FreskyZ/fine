import * as express from 'express';

const api = express.Router();
api.get('/something1', (_, response) => {
    response.send('seomthing1').end();
});
api.get('/something2', (_request, response) => {
    response.send('semething2').end();
});

export { api };
