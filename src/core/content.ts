import syncfs from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import dayjs from 'dayjs';
import koa from 'koa';
import type { DefaultState, DefaultContext } from 'koa';
import type { RowDataPacket } from 'mysql2';
import zlib from 'zlib';
import type { AdminContentCommand } from '../shared/admin.js';
import { pool } from '../adk/database.js';
import { MyError } from './error.js';
import { log } from './logger.js';

// see also file-structure.md and server-routing.md
// handle all kinds of public and static file requests
// public files does not cache in core process memory and use weak cache key
// static files cache in core process memory and use strong cache key
//
// see also short-link.md
// short links looks like normal static link or public link,
// for the get part, while the actual 301/307 is not going to be supported in concrete apps,
// it must be somewhere in core module, auth is already complex, forward is already kind of magic, so it is here

let WEBROOT: string;
// if source map is enabled and source map name related js file exists, will try to find the source map file and compress and return
let AllowSourceMap = false;
// auto close source map after 2 hours in case akari (server) does not close it
let DisableSourceMapTimer: NodeJS.Timeout;

// monotonically nondecreasing now used for cache key
function getnow(): string { return process.hrtime.bigint().toString(16); }
// file extension to content type (as require('mime').lookup)
const extensionToContentType: { [ext: string]: string } = { '.html': 'html', '.js': 'js', '.css': 'css', '.map': 'json' };
// compress encodings
type EncodingToEncoder = { [encoding: string]: (input: Buffer) => Buffer }
const encodingToEncoder: EncodingToEncoder = { 'gzip': zlib.gzipSync, 'deflate': zlib.deflateSync, 'br': zlib.brotliCompressSync };

// no common module in this library, put it here for now
export class RateLimit {
    private readonly buckets: Record<string, {
        count: number, // remining token count
        lastAccessTime: dayjs.Dayjs, // see usage
    }> = {};
    public constructor(
        private readonly maxCount: number, // max tokens
        private readonly refillRate: number // refill count per second
    ) {
        // clear filled buckets regularly
        setInterval(() => Object.entries(this.buckets)
            .filter(e => e[1].count == this.maxCount && dayjs.utc().diff(e[1].lastAccessTime, 'hour') > 1)
            .forEach(([key]) => delete this.buckets[key]), 3600_000);
    }

    public request(key: string) {
        let bucket = this.buckets[key];
        if (!bucket) {
            bucket = { count: 10, lastAccessTime: dayjs.utc() };
            this.buckets[key] = bucket;
        } else {
            const elapsed = dayjs.utc().diff(bucket.lastAccessTime, 'second');
            bucket.count = Math.min(10, bucket.count + elapsed * this.refillRate);
            bucket.lastAccessTime = dayjs.utc();
        }
        bucket.count -= 1;
        if (bucket.count <= 0) {
            throw new MyError('rate-limit');
        }
    }
}

// host => path => realpath mapping
// - host is the host in same origin policy, note that any text difference, e.g. example.com and www.example.com is not same host
// - path can be "." which means empty
// - real path must be one of html/js/css or source map's .js.map
// - last path can be a "*" point to a real path ends with "/*", like "real/path/*",
//   which loads and maps file in webroot/static/real/path directory, not recursive
export type StaticContentConfig = Record<string, Record<string, string>>;

interface Item {
    // relative path after 'static/', does not include 'static/'
    // - reload will use begin with to invalidate cache items
    //   use index to reload index.html and index.css, other files are in their own directory and can use that as reload key
    readonly realpath: string,
    // absolute path, calculate in advance to reduce a little work in handle request
    readonly absolutePath: string,
    // mime type, calculate in advance to reduce a little work in handle request
    readonly contentType: string,
    // will become etag, in form of hex of timestamp
    // - initialize as core process init time, update as admin script invocation
    //   time, admin script will check for content change to move forward this timestamp
    // - it is not file content hash digest because may be slow for large file
    // - it is not file stat last modified time because calling system api may be slow
    // - only admin script will move forward this value,
    //   file changes between 2 invocations of admin script is ignored,
    //   this makes cache key underlying time, content actually loaded time and real path file stat last modified time does not match one another,
    //   but is still correct as a cache key which is required to be a one-to-one match to file content,
    //   and is simpler and more performance and a lot stabler than file system watcher
    cacheKey: string,
    // last modified time,
    // etag has higher priority then last modified, but MDN says it is used in other ways so better provide both
    // https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching#etagif-none-match
    // use same strategy as cacheKey, not the actual value in file system
    lastModified: Date,
    // null if never touched (requested or reload requested), to improve core process init performance
    // set to null to let handle request reload this
    content: Buffer | null,
    // encoding is defined in `encodingToEncoder`
    encodedContent: { [encoding: string]: Buffer },
}

interface StaticContentCache {
    // identifier is realpath
    readonly items: Item[];
    // ${host}/${path} to cache item
    readonly virtualmap: { [virtual: string]: Item };
    // wildcard configs, this is saved for reloading,
    // the path mapping is readdir'd and stored in virtualmap,
    // realdir is relative directory path after 'static/' and without ending '/*'
    readonly wildcardToWildcard: { host: string, realdir: string }[];
    // ${host}/${path} to cache item, for html5 browser history web apps,
    // e.g. a1.example.com/* => static/a1/index.html store as ['a1.example.com', 'a1/index.html']
    // e.g. app.example.com/a1/* => static/a1/index.html store as ['app.example.com/a1', 'a1/index.html']
    readonly wildcardToNonWildcardMap: { virtual: string, item: Item }[],
}
let contentcache: StaticContentCache;

function getOrAddItem(items: Item[], realpath: string): Item {
    let item = items.find(f => f.realpath == realpath);
    if (typeof item == 'undefined') {
        item = {
            realpath,
            absolutePath: path.join(WEBROOT, 'static', realpath),
            contentType: extensionToContentType[path.extname(realpath)],
            cacheKey: getnow(),
            lastModified: new Date(),
            content: null,
            encodedContent: {},
        };
        items.push(item);
    }
    return item;
}

// initialize, or reinitialize
export async function setupStaticContent(webroot: string, config: StaticContentConfig) {
    WEBROOT = webroot;
    // NOTE this is reassigned for reinitialize
    contentcache = { items: [], virtualmap: {}, wildcardToWildcard: [], wildcardToNonWildcardMap: [] };

    await Promise.all(Object.entries(config)
        .flatMap(([host, mappings]) => Object.entries(mappings).map(([vpath, rpath]) => [host, vpath, rpath]))
        .map(async ([host, virtualpath, realpath]) =>
    {
        if (virtualpath != '*' && !virtualpath.endsWith('/*')) {
            if (path.extname(realpath) in extensionToContentType) {
                contentcache.virtualmap[path.join(host, virtualpath)] = getOrAddItem(contentcache.items, realpath);
            } else {
                log.info(`content: realpath not allowed: ${host} + ${virtualpath} => ${realpath}`);
            }
        } else if (realpath.endsWith('/*')) {
            const realdir = realpath.slice(0, realpath.length - 2);
            const absoluteDirectory = path.join(WEBROOT, 'static', realdir);
            if (!syncfs.existsSync(absoluteDirectory)) {
                log.info(`content: realpath not exist: ${host} + ${virtualpath} => ${realpath}`);
                return;
            }
            for (const entry of (await fs.readdir(absoluteDirectory, { withFileTypes: true })).filter(e => e.isFile())) {
                if (path.extname(entry.name) in extensionToContentType) {
                    contentcache.virtualmap[path.join(host, entry.name)] = getOrAddItem(contentcache.items, path.join(realdir, entry.name));
                } else {
                    log.info(`content: realpath ${host} + ${virtualpath} => ${realpath} file ${entry.name} not allowed`)
                }
            }
            contentcache.wildcardToWildcard.push({ host, realdir });
        } else {
            if (path.extname(realpath) in extensionToContentType) {
                const key = path.join(host, virtualpath == '*' ? '' : virtualpath.substring(0, virtualpath.length - 2));
                contentcache.wildcardToNonWildcardMap.push({ virtual: key, item: getOrAddItem(contentcache.items, realpath) });
            } else {
                log.info(`content: realpath not allowed: ${host} + ${virtualpath} => ${realpath}`);
            }
        }
    }));
}

// for now only domain is configured
export interface ShortLinkConfig { domain: string }
let shortLinkConfig: ShortLinkConfig;
export function setupShortLinkService(config: ShortLinkConfig) { shortLinkConfig = config; }

interface ShortLinkData {
    Id: number,
    // path without leading slash, e.g. 'abc' in shortexample.com/abc
    Name: string,
    // the value to be in Location header, should be a url
    Value: string,
    // absolute expiration time utc
    ExpireTime: string,
}
type ShortLinkDataPacket = ShortLinkData & RowDataPacket;
interface ShortLinkCache {
    // short link records
    readonly items: ShortLinkData[],
}
const shortlinkcache: ShortLinkCache = { items: [] };
// rate limit the db operation
const shortlinkratelimit = new RateLimit(10, 1);

async function handleRequestShortLink(ctx: koa.Context) {
    const redirect = (location: string) => {
        ctx.status = 307;
        ctx.type = 'text/plain';
        ctx.body = 'Redirecting...';
        ctx.set('Location', location);
    }
    const notfound = () => {
        if (!(`${ctx.host}/404` in contentcache.virtualmap)) {
            // need to prevent infinite redirection if not configured
            ctx.status = 404;
        } else {
            redirect(`https://${shortLinkConfig.domain}/404`);
        }
    }

    const name = ctx.path.substring(1); // ctx.path == '/' is already checked
    const cacheItem = shortlinkcache.items.find(i => i.Name == name);
    if (cacheItem) {
        if (dayjs.utc(cacheItem.ExpireTime).isBefore(dayjs.utc())) {
            redirect(cacheItem.Value);
        } else {
            const index = shortlinkcache.items.findIndex(i => i.Name == name);
            shortlinkcache.items.splice(index, 1);
            // and goto normal load from db
        }
    }

    // rate limit before invoking db
    shortlinkratelimit.request(ctx.ip || 'unknown');

    const [records] = await pool.query<ShortLinkDataPacket[]>('SELECT `Id`, `Name`, `Value`, `ExpireTime` FROM `ShortLinks` WHERE `Name` = ?;', [name]);
    if (!Array.isArray(records) || records.length == 0) {
        notfound();
    } else if (dayjs.utc(records[0].ExpireTime).isBefore(dayjs.utc())) {
        await pool.execute('DELETE FROM `ShortLinks` WHERE `Id` = ?;', [records[0].Id]);
        notfound();
    } else {
        shortlinkcache.items.push(records[0]);
        redirect(records[0].Value);
    }
}

export async function handleRequestContent(ctx: koa.ParameterizedContext<DefaultState, DefaultContext, Buffer>, next: koa.Next): Promise<any> {
    if (ctx.subdomains[0] == 'api') { return await next(); } // goto api
    if (ctx.method != 'GET') { throw new MyError('method-not-allowed'); } // reject not GET

    // redirect www.example.com to example.com, preserving path, query, and hash
    if (ctx.subdomains.length == 1 && ctx.subdomains[0] == 'www') {
        ctx.status = 301;
        ctx.URL.host = ctx.host.split('.').slice(1).join('.');
        ctx.set('Location', ctx.URL.toString());
        return;
    }

    const cacheKey = `${ctx.host}${ctx.path == '/' ? '' : ctx.path}`;
    // when source map is disabled
    if (cacheKey.endsWith('.map') && !AllowSourceMap) { ctx.status = 404; return; }

    const item = contentcache.virtualmap[cacheKey]
        ?? contentcache.wildcardToNonWildcardMap.find(m => cacheKey.startsWith(m.virtual))?.item;
    if (item) {

        if (item.content === null) {
            if (!syncfs.existsSync(item.absolutePath)) { ctx.status = 404; return; }
            item.content = await fs.readFile(item.absolutePath);
        }

        // https://www.rfc-editor.org/rfc/rfc7232#section-4.1
        // The server generating a 304 response MUST generate any of the
        // following header fields that would have been sent in a 200 (OK) response to the same request:
        // Cache-Control, Content-Location, Date, ETag, Expires, and Vary.
        ctx.set('Cache-Control', 'must-revalidate');
        // use koa.Response.etag setter to add double quote
        // // amzingly chrome accept non double quoted etag and send back non quoted version when revalidating
        ctx.etag = item.cacheKey;
        // vary response encoding by request encoding
        // or else another different accept encoding request will get incorrect encoding
        // // this is actually not the issue for must-revlidate 
        ctx.vary('Accept-Encoding');

        // the conditional request contains 5 header fields and many logics
        // https://www.rfc-editor.org/rfc/rfc9110.html#name-conditional-requests
        // but chrome will only use if none match if cached response contains etag, so only implement this

        // for each etag, trim space, ignore weak
        const requestETags = ctx.request.get('If-None-Match')
            ?.split(',')
            ?.map(t => t.trim()) // trim whitespace
            ?.filter(t => !t.startsWith('W/')) // remove weak
            ?.map(t => t.substring(1, t.length - 1)); // trim quote mark
        if (requestETags.includes(item.cacheKey)) {
            ctx.status = 304;
            return;
        }

        // this is not included in 304 required header list
        ctx.lastModified = item.lastModified;

        ctx.type = item.contentType;
        if (item.content.length < 1024) {
            ctx.body = item.content;
            ctx.set('Content-Length', item.content.length.toString());
            return;
        }

        // prefer brotli because it is smaller,
        // prefer gzip for source map because it is more like a binary file
        for (const encoding of item.realpath.endsWith('.map') ? ['gzip', 'deflate', 'br'] : ['br', 'gzip', 'deflate']) {
            if (ctx.acceptsEncodings(encoding)) {
                ctx.set('Content-Encoding', encoding);
                if (!(encoding in item.encodedContent)) {
                    item.encodedContent[encoding] = encodingToEncoder[encoding](item.content);
                }
                ctx.body = item.encodedContent[encoding];
                ctx.set('Content-Length', item.encodedContent[encoding].length.toString());
                return;
            }
        }
    } else {
        // when new domain/subdomain added and no included in static content config,
        // they goes to here, and make real a 'public/' and pass fs.exists, but cannot fs.readFile that
        if (ctx.path == '/') { ctx.status = 404; return; }

        const publicDirectory = path.join(WEBROOT, 'public');
        const realpath = path.join(publicDirectory, ctx.path);
        // this is a '..' (parent directory) attack
        if (!realpath.startsWith(publicDirectory)) { ctx.status = 404; return; }
        
        const exists = syncfs.existsSync(realpath);
        // short link records have lower priority then static files and public files
        if (!exists && ctx.host == shortLinkConfig.domain) { await handleRequestShortLink(ctx); return; }
        if (!exists) { ctx.status = 404; return; }

        ctx.type = path.extname(ctx.path);
        ctx.body = await fs.readFile(realpath);
        ctx.set('Cache-Control', 'public');

        // use default cache control
        // image/video themselves are already compressed, while other not important text files are always small
    }
}

function handleReloadStatic(key: string) {

    for (const item of contentcache.items.filter(i => i.realpath.startsWith(key))) {
        if (!syncfs.existsSync(item.absolutePath)) {
            contentcache.items.splice(contentcache.items.findIndex(i => i.realpath == item.realpath), 1);
        } else if (item.content === null) {
            // nothing happen when item never requested,
            // when actually requested, the handler will load newest content
        } else {
            const newContent = syncfs.readFileSync(item.absolutePath);
            if (Buffer.compare(item.content, newContent)) {
                item.cacheKey = getnow();
                item.lastModified = new Date(),
                item.content = newContent;
                item.encodedContent = {};
            }
        }
    }

    for (const { host, realdir } of contentcache.wildcardToWildcard.filter(w => w.realdir.startsWith(key))) {
        const absolutedir = path.join(WEBROOT, 'static', realdir);
        if (!syncfs.existsSync(absolutedir)) {
            // wildcard directory may be completely removed
            log.info(`content: configured realpath not exist: ${host} => * => ${realdir}`);
            continue;
        }
        for (const entry of syncfs.readdirSync(absolutedir, { withFileTypes: true }).filter(e => e.isFile())) {
            if (path.extname(entry.name) in extensionToContentType) {
                contentcache.virtualmap[path.join(host, entry.name)] = getOrAddItem(contentcache.items, path.join(realdir, entry.name));
            } else {
                log.info(`content: configured realpath ${host} => * => ${realdir} file ${entry.name} not allowed`)
            }
        }
    }
}
export function handleContentCommand(data: AdminContentCommand): void {
    log.info({ type: 'admin command content', data });

    if (data.type == 'reload-static') {
        handleReloadStatic(data.key);
    } else if (data.type == 'reload-config') {
        // throw away all old cache
        setupStaticContent(WEBROOT, JSON.parse(syncfs.readFileSync('config', 'utf-8'))['static-content']);
    } else if (data.type == 'reset-short-link') {
        shortlinkcache.items.splice(0, shortlinkcache.items.length);
    } else if (data.type == 'enable-source-map') {
        AllowSourceMap = true;
        if (DisableSourceMapTimer) {
            clearTimeout(DisableSourceMapTimer);
        }
        DisableSourceMapTimer = setTimeout(() => AllowSourceMap = false, 7200_000);
    } else if (data.type == 'disable-source-map') {
        AllowSourceMap = false;
    }
}
