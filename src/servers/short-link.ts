import fs from 'node:fs/promises';
import dayjs from 'dayjs';
import mysql from 'mysql2/promise';
import {} from 'dayjs/plugin/utc.js'; // need empty include to add type
import type * as koa from 'koa';
import type { AdminInterfaceCommand, AdminInterfaceResponse } from '../shared/admin.js';
import { databaseTypeCast, type QueryResult } from '../shared/database.js';
import { RateLimit } from '../shared/ratelimit.js';

const config = JSON.parse(await fs.readFile('config', 'utf-8')) as {
    database: mysql.PoolOptions,
    'short-link': { domain: string }, // for now only a domain in config
};
const pool = mysql.createPool({ ...config.database, typeCast: databaseTypeCast });

interface ShortLinkData {
    Id: number,
    // path without leading slash, e.g. 'abc' in shortexample.com/abc
    Name: string,
    // the value to be in Location header, should be a url
    Value: string,
    // absolute expiration time utc
    ExpireTime: dayjs.Dayjs,
}
const cache: { items: ShortLinkData[] } = { items: [] };
const ratelimit = new RateLimit('shortlink', 10, 1);
const cleanupInterval = setInterval(() => ratelimit.cleanup(), 3600_000);

export async function handleRequest(ctx: koa.Context): Promise<boolean> {
    if (ctx.host != config['short-link'].domain) { return false; }

    const redirect = (location: string) => {
        ctx.status = 307;
        ctx.type = 'text/plain';
        ctx.body = 'Redirecting...';
        ctx.set('Location', location);
    };
    const notfound = () => {
        // ATTENTION this require 404 in static config or else this is infinite recursion
        redirect(`https://${config['short-link'].domain}/404`);
    };

    const name = ctx.path.substring(1);
    const cacheItem = cache.items.find(i => i.Name == name);
    if (cacheItem) {
        if (dayjs.utc(cacheItem.ExpireTime).isAfter(dayjs.utc())) {
            redirect(cacheItem.Value);
        } else {
            const index = cache.items.findIndex(i => i.Name == name);
            cache.items.splice(index, 1);
            // and goto normal load from db
        }
    }

    // rate limit before invoking db
    ratelimit.request(ctx.ip || 'unknown');

    const [records] = await pool.query<QueryResult<ShortLinkData>[]>(
        'SELECT `Id`, `Name`, `Value`, `ExpireTime` FROM `ShortLinks` WHERE `Name` = ?;', [name]);
    if (!Array.isArray(records) || records.length == 0) {
        notfound();
    } else if (dayjs.utc(records[0].ExpireTime).isBefore(dayjs.utc())) {
        await pool.execute('DELETE FROM `ShortLinks` WHERE `Id` = ?;', [records[0].Id]);
        notfound();
    } else {
        cache.items.push(records[0]);
        redirect(records[0].Value);
    }
    return true;
}

export async function cleanup() {
    await pool.end();
    cache.items = [];
    ratelimit.cleanup();
    clearInterval(cleanupInterval);
}

export async function handleContentCommand(command: AdminInterfaceCommand): Promise<AdminInterfaceResponse> {
    if (command.kind == 'short-link-server:reload') {
        cache.items = [];
        return { ok: true, log: 'reload short link' };
    }
    return null;
}
