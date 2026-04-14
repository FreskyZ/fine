import fs from 'node:fs/promises';
import path from 'node:path';
import dayjs from 'dayjs';
import {} from 'dayjs/plugin/utc.js'; // need empty include to add type
import type * as koa from 'koa';
import pg from 'pg';
import yaml from 'yaml';
import type { AdminInterfaceCommand, AdminInterfaceResult } from '../shared/admin-types.js';
import { RateLimit } from '../shared/ratelimit.js';

const configPath = path.resolve(process.env['FINE_CONFIG_DIR'] ?? '', 'short-link.yml');
const config = yaml.parse(await fs.readFile(configPath, 'utf-8')) as {
    domain: string,
    database: pg.PoolConfig,
};
const pool = new pg.Pool(config.database);
// pg.types is the same as in core/index.ts, should not set type parser again for in process servers

interface ShortLinkData {
    id: number,
    // path without leading slash, e.g. 'abc' in shortexample.com/abc
    name: string,
    // the value to be in Location header, should be a url
    value: string,
    // absolute expiration time utc
    expire_time: dayjs.Dayjs,
}
const cache: { items: ShortLinkData[] } = { items: [] };
const ratelimit = new RateLimit('shortlink', 10, 1);
const cleanupInterval = setInterval(() => ratelimit.cleanup(), 3600_000);

export async function handleRequest(ctx: koa.Context): Promise<boolean> {
    if (ctx.host != config.domain) { return false; }

    const redirect = (location: string) => {
        ctx.status = 307;
        ctx.type = 'text/plain';
        ctx.body = 'Redirecting...';
        ctx.set('Location', location);
    };
    const notfound = () => {
        // ATTENTION this require 404 in static config or else this is infinite recursion
        redirect(`https://${ctx.host}/404`);
    };

    const name = ctx.path.substring(1);
    const cacheItem = cache.items.find(i => i.name == name);
    if (cacheItem) {
        if (cacheItem.expire_time.isAfter(dayjs.utc())) {
            redirect(cacheItem.value);
        } else {
            const index = cache.items.findIndex(i => i.name == name);
            cache.items.splice(index, 1);
            // and goto normal load from db
        }
    }

    // rate limit before invoking db
    ratelimit.request(ctx.ip || 'unknown');

    const queryResult = await pool.query<ShortLinkData>(
        'SELECT "id", "name", "value", "expire_time" FROM "short_link" WHERE "name" ILIKE $1', [name]);
    if (queryResult.rows.length == 0) {
        notfound();
    } else if (queryResult.rows[0].expire_time.isBefore(dayjs.utc())) {
        await pool.query('DELETE FROM "short_link" WHERE "id" = $1', [queryResult.rows[0].id]);
        notfound();
    } else {
        cache.items.push(queryResult.rows[0]);
        redirect(queryResult.rows[0].value);
    }
    return true;
}

export async function handleClenaup() {
    await pool.end();
    cache.items = [];
    ratelimit.cleanup();
    clearInterval(cleanupInterval);
}

export async function handleAdminCommand(command: AdminInterfaceCommand, result: AdminInterfaceResult): Promise<void> {
    if (command.kind == 'short-link-server:reload') {
        cache.items = [];
        result.status = 'ok';
        result.logs.push('clear short link cache');
    }
}
