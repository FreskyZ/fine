import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import * as koa from 'koa';
import type { DefaultState, DefaultContext } from 'koa';
import type { AdminContentCommand } from '../shared/admin';
import { MyError } from './error';
import { logInfo } from './logger';

// see file-structure.md and server-routing.md
// handle all kinds of file requests, include boring files like robots.txt and build results include html/js/css files
//
// public files does not cache in core process memory and use weak cache key
// static files cache in core process memory and use strong cache key

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

// host => path => realpath mapping
// - host is the host in same origin policy, note that any text difference, include domain.com and www.domain.com is not same host
// - path can be "." which means empty
// - real path must be one of html/js/css or source map's .js.map
// - last path can be a "*" point to a real path ends with "/*", like "real/path/*",
//   which loads and maps file in webroot/static/real/path directory, not recursive
export type StaticContentConfig = Record<string, Record<string, string>>;

type Item = {
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
};
type StaticContent = {
    // primary key is realpath
    readonly items: Item[];
    // ${host}/${path} to cache item
    readonly virtualmap: { [virtual: string]: Item };
    // use wildcard configs, realdir is relative directory path without ending '/*'
    readonly wildcards: { host: string, realdir: string }[];
}

let SC: StaticContent;

function getOrAddItem(realpath: string): Item {
    let item = SC.items.find(f => f.realpath == realpath);
    if (typeof item == 'undefined') {
        item = {
            realpath,
            absolutePath: path.join('webroot', 'static', realpath),
            contentType: extensionToContentType[path.extname(realpath)],
            cacheKey: getnow(),
            lastModified: new Date(),
            content: null,
            encodedContent: {},
        };
        SC.items.push(item);
    }
    return item;
}

// initialize, or reinitialize
export function setupStaticContent(config: StaticContentConfig) {
    SC = { items: [], virtualmap: {}, wildcards: [] };

    for (const [host, virtualpath, realpath] of Object.entries(config)
        .flatMap(([host, mappings]) => Object.entries(mappings).map(([vpath, rpath]) => [host, vpath, rpath]))) {
        if (virtualpath != '*') {
            if (path.extname(realpath) in extensionToContentType) {
                SC.virtualmap[path.join(host, virtualpath)] = getOrAddItem(realpath);
            } else {
                logInfo(`content: configured realpath not allowed: ${host} => ${virtualpath} => ${realpath}`);
            }
        } else {
            const realdir = realpath.slice(0, realpath.length - 2);
            const absoluteDir = path.join('webroot', 'static', realdir);
            if (!fs.existsSync(absoluteDir)) {
                logInfo(`content: configured realpath not exist: ${host} => ${virtualpath} => ${realpath}`);
                continue;
            }
            for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true }).filter(e => e.isFile())) {
                if (path.extname(entry.name) in extensionToContentType) {
                    SC.virtualmap[path.join(host, entry.name)] = getOrAddItem(path.join(realdir, entry.name));
                } else {
                    logInfo(`content: configured realpath ${host} => ${virtualpath} => ${realpath} file ${entry.name} not allowed`)
                }
            }
            SC.wildcards.push({ host, realdir });
        }
    }
}

export async function handleRequestContent(ctx: koa.ParameterizedContext<DefaultState, DefaultContext, Buffer>, next: koa.Next): Promise<any> {
    if (ctx.subdomains[0] == 'api') { return await next(); } // goto api
    if (ctx.method != 'GET') { throw new MyError('method-not-allowed'); } // reject not GET

    const virtual = `${ctx.host}${ctx.path == '/' ? '' : ctx.path}`;
    // disabled source map
    if (virtual.endsWith('.map') && !AllowSourceMap) { ctx.status = 404; return; }

    if (virtual in SC.virtualmap) {
        const item = SC.virtualmap[virtual];

        if (item.content === null) {
            if (!fs.existsSync(item.absolutePath)) { ctx.status = 404; return; }
            item.content = await fs.promises.readFile(item.absolutePath);
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

        const real = path.join("webroot", 'public', ctx.path);
        if (!fs.existsSync(real)) { ctx.status = 404; return; }

        ctx.type = path.extname(ctx.path);
        ctx.body = await fs.promises.readFile(real);
        ctx.set('Cache-Control', 'public');

        // use default cache control
        // image/video themselves are already compressed, while other not important text files are always small
    }
}

function handleReloadStatic(key: string) {

    for (const item of SC.items.filter(i => i.realpath.startsWith(key))) {
        if (!fs.existsSync(item.absolutePath)) {
            SC.items.splice(SC.items.findIndex(i => i.realpath == item.realpath), 1);
        } else if (item.content === null) {
            // nothing happen when item never requested,
            // when actually requested, the handler will load newest content
        } else {
            const newContent = fs.readFileSync(item.absolutePath);
            if (Buffer.compare(item.content, newContent)) {
                item.cacheKey = getnow();
                item.lastModified = new Date(),
                item.content = newContent;
                item.encodedContent = {};
            }
        }
    }

    for (const { host, realdir } of SC.wildcards.filter(w => w.realdir.startsWith(key))) {
        const absolutedir = path.join('webroot', 'static', realdir);
        if (!fs.existsSync(absolutedir)) {
            // wildcard directory may be completely removed
            logInfo(`content: configured realpath not exist: ${host} => * => ${realdir}`);
            continue;
        }
        for (const entry of fs.readdirSync(absolutedir, { withFileTypes: true }).filter(e => e.isFile())) {
            if (path.extname(entry.name) in extensionToContentType) {
                SC.virtualmap[path.join(host, entry.name)] = getOrAddItem(path.join(realdir, entry.name));
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
    } else if (data.type == 'reload-config') {
        // throw away all old cache
        setupStaticContent(JSON.parse(fs.readFileSync('config', 'utf-8'))['static-content']);
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
