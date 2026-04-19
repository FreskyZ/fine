import npfs from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import zlib from 'node:zlib';
import koa from 'koa';
import type { DefaultState, DefaultContext } from 'koa';
import yaml from 'yaml';
import type { AdminInterfaceCommand, AdminInterfaceResult } from '../shared/admin-types.js';
import { MyError } from '../shared/error.js';
import { log } from './logger.js';

// handle content requests, include
// - static content, or frontend build artifacts include html/js/css/wasm files
// - public content, some temporary or not important files
//   like robots.txt or some simple single file applications from small
// - external content provider, handle content request in
//   custom logic other than normal physical file, with full control of the http context,
//   for now short link service use this to read data from database and return 307 redirect response,
//   it was also motivated by serving contents from external object storage, but not implemented for now

// hot reload
// - static content
//   - have precise configure on available items and name mapping
//   - have precise cache control to reduce network traffic and load time
//   - support reload config
// - public content
//   - do not have cache control and simply pipes file stream
//   - do not have configure and directly serve content in the directory, so not related to reload
// - external content provider
//   - support reload custom logic (hot reload nodejs module)
//   - not support update list of services, include add, remove and update configuration,
//     that's because although you can require a cleanup function in the module,
//     the module is not actually removed from nodejs module cache, seems no way to remove
//     from nodejs module cache for now? so I'd like to require a restart for configuration change

// additional topics
// - file system watch based hot reload
//   file system watch api is not reliable, inconsistent across platform,
//   and not possible to implement a reliable reload mechanism based on that,
//   (you can *not* blame this line to find out that, they are a lot older than when this line
//   is write down, but that do exist in history of this file and you can go futhur to find that)
//   so the result is current configuration based, admin interface command trigger reload mechanism
// - comparing to static and public content's "static" style,
//   you may want to call external content provider "dynamic content",
//   but this module, content.ts, is regarded as abbreviation of "static content",
//   with regarding public content a special "not special" kind of static content,
//   and dynamic content means api content, handled in access control, not here
// - external content provider was called content server in old days,
//   to be distinguished to actions server because they use same top level configuration key,
//   I do not want to add too many top level keys because that require changes
//   in index.ts, and more type and function import and export between index.ts and these modules,
//   but now these modules use their own configuration files and is free to add more top level keys,
//   so content related reloadable module is separated from app api server and this name is not used

// webroot
const webroot = process.env['FINE_WEBROOT'] ?? '/var/fine';
// file extension to content type (as require('mime').lookup)
// NOTE for now .wasm files cannot be ecma imported
//      but only fetch, which seems not respecting must-revalidate, but at least it compress
const extensionToContentType: {
    [ext: string]: string,
} = { '.html': 'html', '.js': 'js', '.css': 'css', '.wasm': 'wasm' };
// response compression encodings
const encodingToEncoder: {
    [encoding: string]: (input: Buffer) => Promise<Buffer>,
} = {
    'gzip': promisify(zlib.gzip),
    'deflate': promisify(zlib.deflate),
    'br': promisify(zlib.brotliCompress),
    // 'zstd': promisify(zlib.zstdCompress), // this is experimental, use this when complete experiment
};
// use monotonically nondecreasing time as cache key
function createCacheKey(): string { return process.hrtime.bigint().toString(16); }

interface ExternalProvider {
    readonly name: string,
    readonly module: string,
    version: number,
    // these handlers may be null if load or reload process meet error,
    // but when they are not null, they are always function (typeof == 'function')
    handleRequest?: (ctx: koa.Context) => Promise<boolean>,
    handleCleanup?: () => Promise<void>,
    handleAdminCommand?: (command: AdminInterfaceCommand, result: AdminInterfaceResult) => Promise<void>,
}
interface CacheItem {
    // path relative to WEBROOT/static
    // - reload will use begin with to invalidate cache items
    //   use index to reload index.html and index.css, other files are in their own directory and can use that as reload key
    readonly realpath: string,
    // absolute path, calculate in advance to reduce a little work in handle request
    readonly absolutePath: string,
    // mime type, calculate in advance to reduce a little work in handle request
    readonly contentType: string,
    // will become etag, created from timestamp
    // - initialize to startup time, update when reload
    // - it is not file content digest because may be slow for large files
    // - it is not file stat last modified time because may be slow to call system api
    // - only reload command will move forward this value,
    //   file changes between 2 invocations of admin script is ignored,
    //   this makes cache key underlying time, content load time and real path last modified time not match,
    //   but is still correct as a cache key which is required to be a one-to-one match to file content,
    //   and is simpler, faster and a lot more reliable than file system watcher
    cacheKey: string,
    // last modified time,
    // etag has higher priority then last modified, but MDN says it is used in other ways so better provide both
    // https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching#etagif-none-match
    // use same strategy as cacheKey, not the actual value in file system
    lastModified: Date,
    // null if never touched (requested or reload requested), to improve startup performance
    // set to null to let handle request reload this
    content: Buffer | null,
    // encoding is defined in `encodingToEncoder`
    encodedContent: { [encoding: string]: Buffer },
}
interface ContentData {
    // identifier is realpath
    readonly items: CacheItem[],
    // ${host}/${path} to cache item
    readonly virtualmap: { [virtual: string]: CacheItem },
    // wildcard configs, this is saved for reloading,
    // the path mapping is readdir'd and stored in virtualmap,
    // realdir is relative directory path after 'static/' and without ending '/*'
    readonly wildcardToWildcard: { host: string, realdir: string }[],
    // ${host}/${path} to cache item, for html5 browser history web apps,
    // e.g. a1.example.com/* => static/a1/index.html store as ['a1.example.com', 'a1/index.html']
    // e.g. app.example.com/a1/* => static/a1/index.html store as ['app.example.com/a1', 'a1/index.html']
    // also, this allows 'chat.example.com': { 'share/*': 'chat/share.html', '*': 'chat/index.html' }
    readonly wildcardToNonWildcardMap: { virtual: string, item: CacheItem }[],
    // external content providers
    readonly externalProviders: ExternalProvider[],
}
const contentdata: ContentData = {
    items: [],
    virtualmap: {},
    wildcardToWildcard: [],
    wildcardToNonWildcardMap: [],
    externalProviders: [],
};

// get or insert
function getCacheItem(items: CacheItem[], realpath: string): CacheItem {
    let item = items.find(f => f.realpath == realpath);
    if (typeof item == 'undefined') {
        item = {
            realpath,
            absolutePath: path.join(webroot, 'static', realpath),
            contentType: extensionToContentType[path.extname(realpath)],
            cacheKey: createCacheKey(),
            lastModified: new Date(),
            content: null,
            encodedContent: {},
        };
        items.push(item);
    }
    return item;
}

interface ContentControlConfig {
    // host => path => realpath mapping
    // - host is the host in same origin policy, note that any text difference, e.g. example.com and www.example.com is not same host
    // - path can be "." which means root path
    // - real path must be one of html/css/js/wasm
    // - last path can be a "*" point to a real path ends with "/*", like "real/path/*",
    //   which loads and maps file in webroot/static/real/path directory, not recursive
    // - map * path to not * path maps all virtual path with the same beginning to same file (frontend routing)
    static: Record<string, Record<string, string>>,
    // - module: nodejs module path of the provider
    external: Record<string, { module: string }>,
}
const contentConfigPath = path.resolve(process.env['FINE_CONFIG_DIR'] ?? '', 'content.yml');
export async function setupContentControl() {
    const config = yaml.parse(await fs.readFile(contentConfigPath, 'utf-8')) as ContentControlConfig;

    const result: AdminInterfaceResult = { status: 'unhandled', logs: [] };
    const tasks = [
        handleReloadStaticContentConfig(config.static, result),
        ...Object.entries(config.external).map(async ([name, { module }]) => {
            const result: AdminInterfaceResult = { status: 'unhandled', logs: [] };
            const provider: ExternalProvider = { name, module, version: 0 };
            await handleReloadExternalProvider(provider, result);
            // this insert operation inside promise.all makes providers not in order,
            // actually the yaml.parse + object.entries already don't preserve order,
            // NOTE if you need priority, add them to config type, and don't forget config template
            contentdata.externalProviders.push(provider);
        }),
    ];
    await Promise.all(tasks);
    // partial error in static content and external providers does not make this startup operation fail
}

async function handleReloadStaticContentConfig(config: ContentControlConfig['static'], result: AdminInterfaceResult) {
    // clear cache
    Object.keys(contentdata.virtualmap).forEach(k => delete contentdata.virtualmap[k]);
    contentdata.items.splice(0, contentdata.items.length);
    contentdata.wildcardToWildcard.splice(0, contentdata.wildcardToWildcard.length);
    contentdata.wildcardToNonWildcardMap.splice(0, contentdata.wildcardToNonWildcardMap.length);

    result.status = 'ok'; // default to ok, later may change to error
    await Promise.all(Object.entries(config)
        .flatMap(([host, mappings]) => Object.entries(mappings).map(([vpath, rpath]) => [host, vpath, rpath]))
        .map(async ([host, virtualpath, realpath]) =>
    {
        if (virtualpath != '*' && !virtualpath.endsWith('/*')) {
            if (path.extname(realpath) in extensionToContentType) {
                contentdata.virtualmap[path.join(host, virtualpath)] = getCacheItem(contentdata.items, realpath);
            } else {
                result.status = 'error';
                result.logs.push(`realpath not allowed: ${host} + ${virtualpath} => ${realpath}`);
            }
        } else if (realpath.endsWith('/*')) {
            const realdir = realpath.slice(0, realpath.length - 2);
            const absoluteDirectory = path.join(webroot, 'static', realdir);
            if (!npfs.existsSync(absoluteDirectory)) {
                result.status = 'error';
                result.logs.push(`realpath not exist: ${host} + ${virtualpath} => ${realpath}`);
                return;
            }
            for (const entry of (await fs.readdir(absoluteDirectory, { withFileTypes: true })).filter(e => e.isFile())) {
                if (path.extname(entry.name) in extensionToContentType) {
                    contentdata.virtualmap[path.join(host, entry.name)] = getCacheItem(contentdata.items, path.join(realdir, entry.name));
                } else {
                    result.status = 'error';
                    result.logs.push(`realpath ${host} + ${virtualpath} => ${realpath} file ${entry.name} not allowed`);
                }
            }
            contentdata.wildcardToWildcard.push({ host, realdir });
        } else {
            if (path.extname(realpath) in extensionToContentType) {
                const key = path.join(host, virtualpath == '*' ? '' : virtualpath.substring(0, virtualpath.length - 2));
                contentdata.wildcardToNonWildcardMap.push({ virtual: key, item: getCacheItem(contentdata.items, realpath) });
            } else {
                result.status = 'error';
                result.logs.push(`realpath not allowed: ${host} + ${virtualpath} => ${realpath}`);
            }
        }
    }));
    // duplicate admin command result logs into logger
    for (const item in result.logs) {
        log.info({ cat: 'static content', kind: 'setup static content', item });
    }
}

async function handleReloadExternalProvider(provider: ExternalProvider, result: AdminInterfaceResult) {
    result.status = 'ok'; // default to ok, later may change to error

    if (typeof provider.handleCleanup == 'function') {
        try {
            await provider.handleCleanup();
        } catch (error) {
            result.status = 'error';
            result.logs.push(`${provider.name}: failed to cleanup previous version`, error);
            // not return here
        }
    }
    provider.handleRequest = null;
    provider.handleCleanup = null;
    provider.handleAdminCommand = null;

    let module: any;
    provider.version += 1;
    result.logs.push(`${provider.name}: new version ${provider.version}`);
    try {
        module = await import(`${provider.module}?v=${provider.version}`);
    } catch (error) {
        module = null;
        result.status = 'error';
        result.logs.push(`${provider.name}: failed to load module ${provider.module}`, error);
    }

    if (typeof module?.handleRequest == 'function') {
        provider.handleRequest = module.handleRequest;
    } else if (module) {
        result.status = 'error';
        result.logs.push(`${provider.name}: missing handleRequest or is not a function`);
    }

    if (typeof module?.handleCleanup == 'function') {
        provider.handleCleanup = module.handleCleanup;
    } else if (module?.handleCleanup) {
        result.status = 'error';
        result.logs.push(`${provider.name}: handleCleanup is exported but is not a function?`);
    }
    if (typeof module?.handleAdminCommand == 'function') {
        provider.handleAdminCommand = module.handleAdminCommand;
    } else if (module?.handleAdminCommand) {
        result.status = 'error';
        result.logs.push(`${provider.name}: handleAdminCommand is exported but is not a function?`);
    }

    // duplicate admin command result logs into logger
    for (const item of result.logs) {
        log.info({ cat: 'external content', provider, item });
    }
}

export async function handleRequestContent(ctx: koa.ParameterizedContext<DefaultState, DefaultContext, Buffer>, next: koa.Next): Promise<void> {
    if (ctx.subdomains[0] == 'api') { return await next(); } // goto api
    if (ctx.method != 'GET') { throw new MyError('method-not-allowed'); } // reject not GET

    // redirect www.example.com to example.com, preserving path, query, and hash
    if (ctx.subdomains.length == 1 && ctx.subdomains[0] == 'www') {
        ctx.status = 301;
        ctx.URL.host = ctx.host.split('.').slice(1).join('.');
        ctx.set('Location', ctx.URL.toString());
        return;
    }

    // / is empty in contentdata
    let requestPath = ctx.path == '/' ? '' : ctx.path;
    // return 404 for uri decode error
    try { requestPath = decodeURIComponent(requestPath); } catch { ctx.status = 404; return; }
    // reject any \0
    if (requestPath.includes('\0')) { ctx.status = 404; return; }

    const cacheKey = `${ctx.host}${requestPath}`;
    const item = contentdata.virtualmap[cacheKey]
        ?? contentdata.wildcardToNonWildcardMap.find(m => cacheKey.startsWith(m.virtual))?.item;
    if (item) {
        if (item.content === null) {
            if (!npfs.existsSync(item.absolutePath)) { ctx.status = 404; return; }
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
        let pathname = ctx.URL.pathname;
        // regard uri decode error as not found
        try { pathname = decodeURIComponent(pathname); } catch { ctx.status = 404; return; }
        // normalize unicode, is this really needed?
        pathname = pathname.normalize();
        // trim trailing slash
        if (pathname.endsWith('/')) { pathname = pathname.substring(0, pathname.length - 1); }
        // when '.' is not configured in static content, it goes to here, which should result in not found
        if (!pathname) { ctx.status = 404; return; }

        const realpath = path.join(path.join(webroot, 'public'), pathname);
        // do not allow access to parent folder
        if (!realpath.startsWith(path.join(webroot, 'public'))) { ctx.status = 404; return; }
        // regard dot files as not exist
        if (path.basename(realpath).startsWith('.')) { ctx.status = 404; return; }

        // only allow normal file (reject symlink), if file not exist or other io error, regard as not found
        if (await fs.stat(realpath).then(s => s.isFile()).catch(() => false)) {
            ctx.set('Cache-Control', 'public');
            ctx.type = path.extname(realpath);
            // no response compression here, small text files don't need compression,
            // for large multimedia files, most common formats are compressed by nature
            ctx.body = await fs.readFile(realpath);
        } else {
            // external providers are after public file
            for (const provider of contentdata.externalProviders) {
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

async function handleReloadStaticContent(key: string, result: AdminInterfaceResult): Promise<void> {
    result.status = 'ok'; // partial error in wildcard part does not make this result be regarded as error

    for (const item of contentdata.items.filter(i => i.realpath.startsWith(key))) {
        result.logs.push(`for item ${item.realpath}: `);
        if (!npfs.existsSync(item.absolutePath)) {
            result.logs.push(`realpath not exist, remove`);
            contentdata.items.splice(contentdata.items.findIndex(i => i.realpath == item.realpath), 1);
        } else if (item.content === null) {
            result.logs.push(`content not loaded, do nothing`);
            // nothing happen when item never requested,
            // when actually requested, the handler will load newest content
        } else {
            const newContent = await fs.readFile(item.absolutePath);
            if (Buffer.compare(item.content, newContent)) {
                result.logs.push(`content not same, update`);
                item.cacheKey = createCacheKey();
                item.lastModified = new Date();
                item.content = newContent;
                item.encodedContent = {};
            } else {
                result.logs.push(`content same, not update`);
            }
        }
    }

    for (const { host, realdir } of contentdata.wildcardToWildcard.filter(w => w.realdir.startsWith(key))) {
        const absolutedir = path.join(webroot, 'static', realdir);
        if (!npfs.existsSync(absolutedir)) {
            // wildcard directory may be completely removed
            result.logs.push(`wildcard to wildcard dir not exist: ${host} => * => ${realdir}`);
            continue;
        }
        for (const entry of npfs.readdirSync(absolutedir, { withFileTypes: true }).filter(e => e.isFile())) {
            if (path.extname(entry.name) in extensionToContentType) {
                result.logs.push(`wildcard to wildcard load ${entry.name}`);
                contentdata.virtualmap[path.join(host, entry.name)] = getCacheItem(contentdata.items, path.join(realdir, entry.name));
            } else {
                result.logs.push(`wildcard to wildcard ${host} => * => ${realdir} file ${entry.name} not allowed`);
            }
        }
    }
}
export async function handleContentCommand(command: AdminInterfaceCommand, result: AdminInterfaceResult): Promise<void> {

    // reload static content
    if (command.kind == 'static-content:reload') {
        await handleReloadStaticContent(command.key, result);
    // reload static content config
    } else if (command.kind == 'static-content:reload-config') {
        const config: ContentControlConfig = yaml.parse(await fs.readFile(contentConfigPath, 'utf-8'));
        await handleReloadStaticContentConfig(config.static, result);
    // reload external content provider TODO rename command
    } else if (command.kind == 'content-server:reload') {
        const index = contentdata.externalProviders.findIndex(s => s.name == command.name);
        if (index >= 0) {
            await handleReloadExternalProvider(contentdata.externalProviders[index], result);
        } else {
            result.status = 'error';
            result.logs.push('provider name not found');
        }
    }

    // send to external content provider's command handler
    for (const provider of contentdata.externalProviders) {
        if (provider.handleAdminCommand) {
            await provider.handleAdminCommand(command, result);
            if (result.status != 'unhandled') { return; } // else continue to next handler
        }
    }
}
