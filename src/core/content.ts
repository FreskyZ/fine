import syncfs from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import koa from 'koa';
import type { DefaultState, DefaultContext } from 'koa';
import zlib from 'zlib';
import type { AdminInterfaceCommand, AdminInterfaceResult } from '../shared/admin-types.js';
import { MyError } from '../shared/error.js';
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

let webroot: string;
export function setupWebroot(value: string) { webroot = value; }

// content and access both use this config item, put it here because first used here
export type ServerProviderConfig = Record<string, {
    // in format `appname.example.com` or `app.example.com`,
    // no 'https://' prefix, no '/' postfix,
    // `app.example.com` means this is on `https://app.example.com/appname`
    // actions server will validate origin or referrer, content server does not use this
    host: string,
    // content server provider, nodejs script path
    content: string,
    // actions server provider, in format `nodejs:/absolute/path/to/server.js` or `socket:/absolute/path/to/socket.sock`
    actions: string,
}>;

// monotonically nondecreasing now used for cache key
function getnow(): string { return process.hrtime.bigint().toString(16); }
// file extension to content type (as require('mime').lookup)
// .wasm files cannot be ecma imported but only fetch, which seems not respecting must-revalidate, but at least it compress
const extensionToContentType: { [ext: string]: string } = { '.html': 'html', '.js': 'js', '.css': 'css', '.wasm': 'wasm' };
// compress encodings
type EncodingToEncoder = { [encoding: string]: (input: Buffer) => Promise<Buffer> };
const encodingToEncoder: EncodingToEncoder = {
    'gzip': promisify(zlib.gzip),
    'deflate': promisify(zlib.deflate),
    'br': promisify(zlib.brotliCompress),
    // 'zstd': promisify(zlib.zstdCompress), // this is experimental, use this when complete experiment
};

// host => path => realpath mapping
// - host is the host in same origin policy, note that any text difference, e.g. example.com and www.example.com is not same host
// - path can be "." which means empty
// - real path must be one of html/css/js/wasm
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
    readonly items: Item[],
    // ${host}/${path} to cache item
    readonly virtualmap: { [virtual: string]: Item },
    // wildcard configs, this is saved for reloading,
    // the path mapping is readdir'd and stored in virtualmap,
    // realdir is relative directory path after 'static/' and without ending '/*'
    readonly wildcardToWildcard: { host: string, realdir: string }[],
    // ${host}/${path} to cache item, for html5 browser history web apps,
    // e.g. a1.example.com/* => static/a1/index.html store as ['a1.example.com', 'a1/index.html']
    // e.g. app.example.com/a1/* => static/a1/index.html store as ['app.example.com/a1', 'a1/index.html']
    // also, this allows 'chat.example.com': { 'share/*': 'chat/share.html', '*': 'chat/index.html' }
    readonly wildcardToNonWildcardMap: { virtual: string, item: Item }[],
}

let contentcache: StaticContentCache;
function getOrAddItem(items: Item[], realpath: string): Item {
    let item = items.find(f => f.realpath == realpath);
    if (typeof item == 'undefined') {
        item = {
            realpath,
            absolutePath: path.join(webroot, 'static', realpath),
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

async function setupStaticContentImpl(config: StaticContentConfig, result: AdminInterfaceResult): Promise<void> {
    // partial errors in static content loading does not make this result be regarded as error
    result.status = 'ok';
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
                result.logs.push(`realpath not allowed: ${host} + ${virtualpath} => ${realpath}`);
            }
        } else if (realpath.endsWith('/*')) {
            const realdir = realpath.slice(0, realpath.length - 2);
            const absoluteDirectory = path.join(webroot, 'static', realdir);
            if (!syncfs.existsSync(absoluteDirectory)) {
                result.logs.push(`realpath not exist: ${host} + ${virtualpath} => ${realpath}`);
                return;
            }
            for (const entry of (await fs.readdir(absoluteDirectory, { withFileTypes: true })).filter(e => e.isFile())) {
                if (path.extname(entry.name) in extensionToContentType) {
                    contentcache.virtualmap[path.join(host, entry.name)] = getOrAddItem(contentcache.items, path.join(realdir, entry.name));
                } else {
                    result.logs.push(`realpath ${host} + ${virtualpath} => ${realpath} file ${entry.name} not allowed`);
                }
            }
            contentcache.wildcardToWildcard.push({ host, realdir });
        } else {
            if (path.extname(realpath) in extensionToContentType) {
                const key = path.join(host, virtualpath == '*' ? '' : virtualpath.substring(0, virtualpath.length - 2));
                contentcache.wildcardToNonWildcardMap.push({ virtual: key, item: getOrAddItem(contentcache.items, realpath) });
            } else {
                result.logs.push(`realpath not allowed: ${host} + ${virtualpath} => ${realpath}`);
            }
        }
    }));
}
// initial setup static content called by startup process
export async function setupStaticContent(config: StaticContentConfig) {
    const result: AdminInterfaceResult = { status: 'ok', logs: [] };
    await setupStaticContentImpl(config, result);
    for (const item in result.logs) {
        log.info({ cat: 'static content', kind: 'setup static content', item });
    }
}

interface ContentServerProvider {
    readonly name: string,
    readonly server: string,
    version: number,
    // setup this when load version
    handleRequest?: (ctx: koa.Context) => Promise<boolean>,
    handleCleanup?: () => Promise<void>,
    handleAdminCommand?: (command: AdminInterfaceCommand, result: AdminInterfaceResult) => Promise<void>,
}
let contentservers: ContentServerProvider[];

async function setupContentServer(provider: ContentServerProvider, result: AdminInterfaceResult): Promise<ContentServerProvider> {
    result.status = 'ok'; // default to ok, later may change to error

    if (typeof provider.handleCleanup == 'function') {
        try {
            await provider.handleCleanup();
        } catch (error) {
            result.status = 'error';
            result.logs.push(`failed to cleanup previous version`, error);
            // not return here
        }
    }
    let module: any;
    provider.version += 1;
    result.logs.push(`new version ${provider.version}`);
    try {
        module = await import(`${provider.server}?v=${provider.version}`);
    } catch (error) {
        result.status = 'error';
        result.logs.push(`failed to load module ${provider.server}`, error);
        // don't include mismatched handlers
        return { name: provider.name, server: provider.server, version: provider.version };
    }

    if (!module.handleRequest || typeof module.handleRequest != 'function') {
        result.status = 'error';
        result.logs.push(`missing handleRequest or is not function`);
        // don't include mismatched handlers
        return { name: provider.name, server: provider.server, version: provider.version };
    }
    provider.handleRequest = module.handleRequest;

    if (module.handleCleanup) {
        if (typeof module.handleCleanup == 'function') {
            provider.handleCleanup = module.handleCleanup;
        } else {
            result.logs.push(`handleCleanup is exported but is not a function?`);
        }
    }
    if (module.handleAdminCommand) {
        if (typeof module.handleAdminCommand == 'function') {
            provider.handleAdminCommand = module.handleAdminCommand;
        } else {
            result.logs.push(`handleAdminCommand is exported but is not a function?`);
        }
    }

    if (result.logs.length == 0) {
        result.logs.push('complete setup content server');
    }
    return provider;
}
export async function setupContentServers(config: ServerProviderConfig) {
    contentservers = await Promise.all(Object.entries(config).filter(s => s[1].content).map(async s => {
        const result: AdminInterfaceResult = { status: 'unhandled', logs: [] };
        const provider = await setupContentServer({ name: s[0], server: s[1].content, version: 0 }, result);
        for (const item in result.logs) { log.error({ cat: 'content', kind: 'setup content server', provider, item }); }
        return provider;
    }));
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
        ctx.type = item.contentType;
        // this is not included in 304 required header list
        ctx.lastModified = item.lastModified;

        if (item.content.length < 1024) {
            ctx.body = item.content;
            ctx.set('Content-Length', item.content.length.toString());
            return;
        }
        // prefer brotli because it is newer
        for (const encoding of ['br', 'gzip', 'deflate']) {
            if (ctx.acceptsEncodings(encoding)) {
                ctx.set('Content-Encoding', encoding);
                if (!(encoding in item.encodedContent)) {
                    item.encodedContent[encoding] = await encodingToEncoder[encoding](item.content);
                }
                ctx.body = item.encodedContent[encoding];
                ctx.set('Content-Length', item.encodedContent[encoding].length.toString());
                return;
            }
        }
        // if no accept encoding, send original
        ctx.body = item.content;
        ctx.set('Content-Length', item.content.length.toString());
    } else {
        // ignore query part
        const pathname = ctx.URL.pathname;
        // trim trailing slash
        const trimmedPathName = pathname.endsWith('/') ? pathname.substring(0, pathname.length - 1) : pathname;
        // when '.' is not configured for a host, it goes to here, which should result in not found
        if (!trimmedPathName) { ctx.status = 404; return; }

        const realpath = path.join(path.join(webroot, 'public'), trimmedPathName);
        // do not allow access to parent folder
        if (!realpath.startsWith(path.join(webroot, 'public'))) { ctx.status = 404; return; }

        // only allow normal file, ignore rejection and regard as not normal file
        if (await fs.stat(realpath).then(s => s.isFile()).catch(() => false)) {
            ctx.set('Cache-Control', 'public');
            ctx.type = path.extname(realpath);
            // no response compression here,
            // image/video themselves are already compressed, while other not important text files should be small
            ctx.body = await fs.readFile(realpath);
        } else {
            // content servers are after public file
            for (const provider of contentservers) {
                if (typeof provider.handleRequest == 'function' && await provider.handleRequest(ctx)) { return; }
            }
            // and the final 404 for not find anything
            ctx.status = 404;
        }
    }
}

// this is actually invoked before handlerequestforward, which only compress result from actual servers
// but there is existing encoding logic here, and this is not very proper to put in access.js and forward.js, so put it here
export async function handleResponseCompression(ctx: koa.Context, next: koa.Next) {
    await next();

    if (ctx.method == 'HEAD') { return; } // skip HEAD, will this method come here?
    if (ctx.status < 200 || ctx.status >= 300) { return; } // skip non 2xx
    if (!ctx.body) { return; } // skip no body (not skip nobody?)
    if (ctx.response.get('Content-Encoding')) { return; } // skip already compressed, when will this happen?
    if (typeof ctx.body != 'string' && typeof ctx.body != 'object') { return; } // skip unknown body type, when will this happen?

    const encoding = ['br', 'deflate', 'gzip'].find(e => ctx.acceptsEncodings(e));
    if (!encoding) { return; } // skip no accept encoding or no matching accepted encoding

    const buffer = typeof ctx.body == 'string' ? Buffer.from(ctx.body)
        : Buffer.isBuffer(ctx.body) ? ctx.body : Buffer.from(JSON.stringify(ctx.body)); // handle ctx.body is already buffer
    if (buffer.length < 1024) { return; } // skip small body

    // finally start encoding
    ctx.vary('Accept-Encoding');
    ctx.set('Content-Encoding', encoding);
    ctx.set('Content-Type', typeof ctx.body == 'string' ? 'text/plain; charset=utf-8'
        : Buffer.isBuffer(ctx.body) ? 'application/octet-stream' : 'application/json; charset=utf-8');

    const encoded = await encodingToEncoder[encoding](buffer);
    ctx.body = encoded;
    ctx.set('Content-Length', encoded.length.toString());
}

async function handleReload(key: string, result: AdminInterfaceResult): Promise<void> {
    result.status = 'ok'; // partial error in wildcard part does not make this result be regarded as error

    for (const item of contentcache.items.filter(i => i.realpath.startsWith(key))) {
        result.logs.push(`for item ${item.realpath}: `);
        if (!syncfs.existsSync(item.absolutePath)) {
            result.logs.push(`realpath not exist, remove`);
            contentcache.items.splice(contentcache.items.findIndex(i => i.realpath == item.realpath), 1);
        } else if (item.content === null) {
            result.logs.push(`content not loaded, do nothing`);
            // nothing happen when item never requested,
            // when actually requested, the handler will load newest content
        } else {
            const newContent = await fs.readFile(item.absolutePath);
            if (Buffer.compare(item.content, newContent)) {
                result.logs.push(`content not same, update`);
                item.cacheKey = getnow();
                item.lastModified = new Date();
                item.content = newContent;
                item.encodedContent = {};
            } else {
                result.logs.push(`content same, not update`);
            }
        }
    }

    for (const { host, realdir } of contentcache.wildcardToWildcard.filter(w => w.realdir.startsWith(key))) {
        const absolutedir = path.join(webroot, 'static', realdir);
        if (!syncfs.existsSync(absolutedir)) {
            // wildcard directory may be completely removed
            result.logs.push(`wildcard to wildcard dir not exist: ${host} => * => ${realdir}`);
            continue;
        }
        for (const entry of syncfs.readdirSync(absolutedir, { withFileTypes: true }).filter(e => e.isFile())) {
            if (path.extname(entry.name) in extensionToContentType) {
                result.logs.push(`wildcard to wildcard load ${entry.name}`);
                contentcache.virtualmap[path.join(host, entry.name)] = getOrAddItem(contentcache.items, path.join(realdir, entry.name));
            } else {
                result.logs.push(`wildcard to wildcard ${host} => * => ${realdir} file ${entry.name} not allowed`);
            }
        }
    }
}
export async function handleContentCommand(command: AdminInterfaceCommand, result: AdminInterfaceResult): Promise<void> {

    // reload static content
    if (command.kind == 'static-content:reload') {
        await handleReload(command.key, result);

    // reload static content config
    } else if (command.kind == 'static-content:reload-config') {
        await setupStaticContentImpl(JSON.parse(syncfs.readFileSync('config', 'utf-8'))['static-content'], result);

    // reload content server provider
    } else if (command.kind == 'content-server:reload') {
        const index = contentservers.findIndex(s => s.name == command.name);
        if (index >= 0) {
            contentservers[index] = await setupContentServer(contentservers[index], result);
        } else {
            result.status = 'error';
            result.logs.push('content server name not found');
        }
    }

    // send to content server's command handler
    for (const provider of contentservers) {
        if (provider.handleAdminCommand) {
            await provider.handleAdminCommand(command, result);
            if (result.status != 'unhandled') { return; } // else continue to next handler
        }
    }
}
