/// <reference path="../shared/types/config.d.ts" />
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import * as koa from 'koa';
import { logInfo } from './logger';
import { MyError } from '../shared/error';

// see server-routing.md
// handle all kinds of file requests, include html/js/css/image and not interesting robots.txt, sitemap.xml, etc.

// NOTE: this route config get rid of explaining things like 'what is realodable', 'what is cached', /any/ handling, etc. issues
// reload by reload key, knowns files are all cached, not known files will redirect to public, any is handled by ['www'].concat(apps)
const knownFiles: ReadonlyArray<Readonly<{ virtual: string, real: string, reloadKey: string }>> = [
    { virtual: '/www/', real: 'home/index.html', reloadKey: 'www' },
    { virtual: '/www/index.css', real: 'home/index.css', reloadKey: 'www' },
    
    ...['www'].concat(APP_NAMES).map(any => ({ virtual: `/${any}/404`, real: 'home/404.html', reloadKey: 'no' })),
    ...['www'].concat(APP_NAMES).map(any => ({ virtual: `/${any}/418`, real: 'home/404.html', reloadKey: 'no' })),
    ...['www'].concat(APP_NAMES).map(any => ({ virtual: `/${any}/login`, real: 'home/login.html', reloadKey: 'login' })),
    ...['www'].concat(APP_NAMES).map(any => ({ virtual: `/${any}/login.js`, real: 'home/login.js', reloadKey: 'login' })),
    ...['www'].concat(APP_NAMES).map(any => ({ virtual: `/${any}/login.css`, real: 'home/login.css', reloadKey: 'login' })),

    ...APP_NAMES.map(app => ({ virtual: `/${app}/`, real: `${app}/index.html`, reloadKey: app })),
    ...APP_NAMES.map(app => ({ virtual: `/${app}/index.js`, real: `${app}/client.js`, reloadKey: app })),
    ...APP_NAMES.map(app => ({ virtual: `/${app}/index.js.map`, real: `${app}/client.js.map`, reloadKey: app })),
    ...APP_NAMES.map(app => ({ virtual: `/${app}/index.css`, real: `${app}/index.css`, reloadKey: app })),
];
// name is absolute path
interface FileCache { name: string, type: string, content: string | null }
const extensionToType: { [ext: string]: string } = { '.html': 'html', '.js': 'js', '.css': 'css', '.map': 'json' };
const fileCache: FileCache[] = knownFiles
    .map(f => f.real)
    .filter((real, index, array) => array.indexOf(real) == index) // deduplicate
    .map(real => ({ name: path.join(WEBROOT, real), type: extensionToType[path.extname(real)], content: null }));

// key is /${subdomain ?? 'www'}${path}, value is absolute path
// use 2 step because some virtual path point to same real path, while same real path should have same cache entry
const virtualToReal: { [key: string]: string } = knownFiles.reduce<{ [key: string]: string }>((acc, f) => { acc[f.virtual] = path.join(WEBROOT, f.real); return acc; }, {});
// key is absolute path, value is cache entry
const realToCache: { [name: string]: FileCache } = fileCache.reduce<{ [name: string]: FileCache }>((acc, c) => { acc[c.name] = c; return acc; }, {});
// key is reload key, value is cache entry, use to conveniently invalidate cache by admin
const reloadKeyToCache: { [reloadKey: string]: FileCache[] } = knownFiles
    .map(f => f.reloadKey)
    .filter((reloadKey, index, array) => array.indexOf(reloadKey) == index)
    .reduce<{ [reloadKey: string]: FileCache[] }>((acc, reloadKey) => { acc[reloadKey] = knownFiles.filter(f => f.reloadKey == reloadKey).map(f => realToCache[virtualToReal[f.virtual]]); return acc; }, {});

export async function handleRequestContent(ctx: koa.Context, next: koa.Next) {
    if (ctx.subdomains.length == 1 && ctx.subdomains[0] == 'api') { return await next(); } // goto api
    if (ctx.method != 'GET') { throw new MyError('method-not-allowed'); } // reject not GET

    const virtual = `/${ctx.subdomains.length == 0 ? 'www' : ctx.subdomains[0]}${ctx.path}`;
    if (virtual in virtualToReal) {
        const cachedFile = realToCache[virtualToReal[virtual]];
        if (cachedFile.content === null) {
            if (!fs.existsSync(cachedFile.name)) { ctx.status = 404; return; }
            cachedFile.content = await fsp.readFile(cachedFile.name, 'utf-8');
        }

        ctx.type = cachedFile.type;
        ctx.body = cachedFile.content;
    } else {
        const real = path.join(WEBROOT, 'public', ctx.path);
        if (!fs.existsSync(real)) { ctx.status = 404; return; }

        ctx.type = path.extname(ctx.path);
        ctx.body = await fsp.readFile(real);
    }
}

export function handleAdminReloadStatic(key: string) {
    logInfo({ type: 'reload-static', value: { key }});
    if (key in reloadKeyToCache) {
        for (const cachedFile of reloadKeyToCache[key]) {
            cachedFile.content = null;
        }
    }
}
