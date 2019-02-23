import * as express from 'express';
let router = express.Router();

router.get('/', (_request, response) => {
    response.send('hello from sh-bus api');
});

export default router;

