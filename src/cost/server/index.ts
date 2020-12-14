// ATTENTION:
// This code was generated by a tool.
// Changes to this file may cause incorrect behavior and will be lost if the code is regenerated.

import { WebContext, validateId, validateBody } from '../../shared/api-server';
import { MyError } from '../../shared/error';
import { getChanges, createChange, getChange, updateChange, deleteChange } from './default';

export async function dispatch(ctx: WebContext) {
    let match: RegExpExecArray;
    if (!ctx.path.startsWith('/cost/v1')) { throw new MyError('not-found', 'invalid invocation version'); }
    const methodPath = `${ctx.method} ${ctx.path.slice(8)}`;

    match = /^GET \/changes$/.exec(methodPath); if (match) {
        ctx.body = await getChanges(ctx.state);
        return;
    }
    match = /^POST \/changes\/(?<changeId>\d+)$/.exec(methodPath); if (match) {
        ctx.body = await createChange(ctx.state, validateId('changeId', match.groups['changeId']), validateBody(ctx.request.body));
        ctx.status = 201;
        return;
    }
    match = /^GET \/changes\/(?<changeId>\d+)$/.exec(methodPath); if (match) {
        ctx.body = await getChange(ctx.state, validateId('changeId', match.groups['changeId']));
        return;
    }
    match = /^PUT \/changes\/(?<changeId>\d+)$/.exec(methodPath); if (match) {
        ctx.body = await updateChange(ctx.state, validateId('changeId', match.groups['changeId']), validateBody(ctx.request.body));
        return;
    }
    match = /^DELETE \/changes\/(?<changeId>\d+)$/.exec(methodPath); if (match) {
        await deleteChange(ctx.state, validateId('changeId', match.groups['changeId']));
        ctx.status = 204;
        return;
    }

    throw new MyError('not-found', 'invalid invocation');
}
