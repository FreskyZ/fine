/// <reference path="../shared/types/config.d.ts" />
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import * as koa from 'koa';
import type { DefaultState, DefaultContext } from 'koa';
import type { AdminContentCommand } from '../shared/types/admin';
import { MyError } from '../shared/error';
import { logInfo } from './logger';

// see file-structure.md and server-routing.md
// handle all kinds of file requests, include boring files like robots.txt and build results include html/js/css files
//
// public files does not cache in core process memory and use weak cache key
// static files cache in core process memory and use strong cache key

// if certificating, return dummy value for required domains
export async function handleCertificate(ctx: koa.Context, next: koa.Next): Promise<any> {
    if (!('FINE_CERTIFICATE' in process.env)) {
        return await next();
    }

    if (ctx.path == '/') {
        ctx.status = 200;
    } else {
        try {
            ctx.body = fs.readFileSync(path.join('public', ctx.path));
            ctx.status = 200;
        } catch {
            // there is still hostile access to random maybe-glitch-in-other-platform files when certificating
            ctx.status = 404;
        }
    }
}

// initial config in akaric: domain => path => realpath mapping
// - domain is an origin in same origin policy, which is protocol + host + port,
//   because protocol and port is all https and https default, this key is the host, note that domain.com and www.domain.com is not same origin
// - path can be "." which means empty
// - real path must be one of html/js/css or source map's .js.map
// - last path can be a "*" point to a real path ends with "/*", like "real/path/*",
//   which loads and mapps are file in webroot/static/real/path directory, not recursive
// - example: {
//     "domain.com": { ".": "index.html", "index.css": "index.css", "user": "user.html", "user.js": "user.js" },
//     "www.domain.com": /* same as domain.com */,
//     "myapp.domain.com": { ".": "myapp/index.html", "index.js": "myapp/index.js", "index.css": "myapp/index.css", "user": "user.html" },
//     "anotherdomain.com": { ".": "anotherapp/index.html", "*": "anotherapp/*" }
// }
// declare const INIT_STATIC_CONTENT: Record<string, Record<string, string>>;

// if source map is enabled and source map name related js file exists, will try to find the source map file and compress and return
let AllowSourceMap = false;
// auto close source map after 2 hours in case akari (server) does not close it
let DisableSourceMapTimer: NodeJS.Timeout;

// monotonically nondecreasing now used for cache key
function getnow(): string { return process.hrtime.bigint().toString(16); }
// file extension to content type (as mime.lookup)
const extensionToContentType: { [ext: string]: string } = { '.html': 'html', '.js': 'js', '.css': 'css', '.map': 'json' };

type StaticCacheItem = {
    // relative path
    // - reload will use begin with to invalidate cache items
    // - specially for builtin page, index.html/index.css is 'home', 'user.html/user.js/user.css' is 'user',
    //   other files are in their own directory and should have proper reload key
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
    // null if never touched (requested or reload requested), to improve core process init performance
    // set to null to let handle request reload this
    content: Buffer | null,
    // encoding is defined in `encodingToEncoder`
    encodedContent: { [encoding: string]: Buffer },
};

class StaticCache {
    // primary key is realpath
    readonly items: StaticCacheItem[] = [];
    // ${host}/${path} to cache item
    readonly virtualmap: { [virtual: string]: StaticCacheItem } = {};
    // hide virtual path starts with any item, by returning 404,
    // admin script can disable/reenable host or host + path at runtime, but not add/remove because that's complex
    readonly virtualmask: string[] = [];
    // use wildcard configs, realdir is relative directory path without ending '/*'
    readonly wildcards: { host: string, realdir: string }[] = [];

    getOrAddItem(realpath: string): StaticCacheItem {
        let item = this.items.find(f => f.realpath == realpath);
        if (typeof item == 'undefined') {
            item = {
                realpath,
                absolutePath: path.join('WEBROOT', 'static', realpath),
                contentType: extensionToContentType[path.extname(realpath)],
                cacheKey: getnow(),
                content: null,
                encodedContent: {},
            };
            this.items.push(item);
        }
        return item;
    }

    constructor() {
        // the variable will be replaced when transpiling, assign to variable to reduce duplication,
        // also there is type error if you directly write { "domain.com": ..., "www.domain.com": ... }[string_variable]
        // because typescript think { "domain.com": ..., "www.domain.com": ... }'s type is { "domain.com": ..., "www.domain.com": ... }
        const CONFIG: Record<string, Record<string, string>> = INIT_STATIC_CONTENT;

        for (const host in CONFIG) {
            for (const virtualpath in CONFIG[host]) {
                const realpath = CONFIG[host][virtualpath];
                if (virtualpath != '*') {
                    if (path.extname(realpath) in extensionToContentType) {
                        this.virtualmap[path.join(host, virtualpath)] = this.getOrAddItem(realpath);
                    } else {
                        logInfo(`content: configured realpath not allowed: ${host} => ${virtualpath} => ${realpath}`);
                    }
                } else {
                    const realdir = realpath.slice(0, realpath.length - 2);
                    const absoluteDir = path.join('WEBROOT', 'static', realdir);
                    if (!fs.existsSync(absoluteDir)) {
                        logInfo(`content: configured realpath not exist: ${host} => ${virtualpath} => ${realpath}`);
                        continue;
                    }
                    for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true }).filter(e => e.isFile())) {
                        if (path.extname(entry.name) in extensionToContentType) {
                            this.virtualmap[path.join(host, entry.name)] = this.getOrAddItem(path.join(realdir, entry.name));
                        } else {
                            logInfo(`content: configured realpath ${host} => ${virtualpath} => ${realpath} file ${entry.name} not allowed`)
                        }
                    }
                    this.wildcards.push({ host, realdir });
                }
            }
        }
    }
}
const CACHE = new StaticCache();

type EncodingToEncoder = { [encoding: string]: (input: Buffer) => Buffer }
const encodingToEncoder: EncodingToEncoder = { 'gzip': zlib.gzipSync, 'deflate': zlib.deflateSync, 'br': zlib.brotliCompressSync };

export async function handleRequestContent(ctx: koa.ParameterizedContext<DefaultState, DefaultContext, Buffer>, next: koa.Next): Promise<any> {
    if (ctx.subdomains[0] == 'api') { return await next(); } // goto api
    if (ctx.method != 'GET') { throw new MyError('method-not-allowed'); } // reject not GET

    const virtual = `${ctx.host}${ctx.path == '/' ? '' : ctx.path}`;

    // disabled virtual path
    if (CACHE.virtualmask.some(m => virtual.includes(m))) { ctx.status = 404; return; }
    // disabled source map
    if (virtual.endsWith('.map') && !AllowSourceMap) { ctx.status = 404; return; }

    if (virtual in CACHE.virtualmap) {
        const item = CACHE.virtualmap[virtual];

        if (item.content === null) {
            if (!fs.existsSync(item.absolutePath)) { ctx.status = 404; return; }
            item.content = await fs.promises.readFile(item.absolutePath);
        }

        // for each etag, trim space, ignore weak
        const requestETags = ctx.request.get('If-None-Match')?.split(',')?.map(t => t.trim())?.filter(t => !t.startsWith('W/'));
        if (requestETags.includes(item.cacheKey)) {
            ctx.status = 304;
            return;
        }

        ctx.set('Cache-Control', 'must-revalidate');
        ctx.set('ETag', item.cacheKey);
        ctx.type = item.contentType;

        if (item.content.length < 1024) {
            ctx.body = item.content;
            ctx.set('Content-Length', item.content.length.toString());
            return;
        }

        ctx.vary('Accept-Encoding');
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
        const real = path.join("WEBROOT", 'public', ctx.path);
        if (!fs.existsSync(real)) { ctx.status = 404; return; }

        ctx.type = path.extname(ctx.path);
        ctx.body = await fs.promises.readFile(real);
        ctx.set('Cache-Control', 'public');

        // use default cache control
        // image/video themselves are already compressed, while other not important text files are always small
    }
}

function handleReloadStatic(key: string) {

    for (const item of CACHE.items.filter(i => i.realpath.startsWith(key))) {
        if (!fs.existsSync(item.absolutePath)) {
            CACHE.items.splice(CACHE.items.findIndex(i => i.realpath == item.realpath), 1);
        } else if (item.content === null) {
            // nothing happen when item never requested,
            // when actually requested, the handler will load newest content
        } else {
            const newContent = fs.readFileSync(item.absolutePath);
            if (Buffer.compare(item.content, newContent)) {
                item.cacheKey = getnow();
                item.content = newContent;
                item.encodedContent = {};
            }
        }
    }

    for (const { host, realdir } of CACHE.wildcards.filter(w => w.realdir.startsWith(key))) {
        const absolutedir = path.join('WEBROOT', 'static', realdir);
        if (!fs.existsSync(absolutedir)) {
            // wildcard directory may be completely removed
            logInfo(`content: configured realpath not exist: ${host} => * => ${realdir}`);
            continue;
        }
        for (const entry of fs.readdirSync(absolutedir, { withFileTypes: true }).filter(e => e.isFile())) {
            if (path.extname(entry.name) in extensionToContentType) {
                CACHE.virtualmap[path.join(host, entry.name)] = CACHE.getOrAddItem(path.join(realdir, entry.name));
            } else {
                logInfo(`content: configured realpath ${host} => * => ${realdir} file ${entry.name} not allowed`)
            }
        }
    }
}
export function handleCommand(data: AdminContentCommand): void {
    logInfo({ type: 'admin command content', data });

    if (data.type == 'reload-static') {
        handleReloadStatic(data.key);
    } else if (data.type == 'enable-static') {
        if (CACHE.virtualmask.includes(data.key)) {
            CACHE.virtualmask.splice(CACHE.virtualmask.indexOf(data.key), 1);
        }
    } else if (data.type == 'disable-static') {
        if (!CACHE.virtualmask.includes(data.key)) {
            CACHE.virtualmask.push(data.key);
        }
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
