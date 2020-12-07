import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import * as koa from 'koa';
import { AdminContentUpdateParameter } from '../shared/types/admin';
import { config } from './config';
import { logInfo } from './logger';
import { MyError } from '../shared/error';

// see server-routing.md
// handle all kinds of file requests, include html/js/css/image and not interesting robots.txt, sitemap.xml, etc.

// GET /any/404 and GET /any/518
// return non-reload-able static stand alone html text
const html404 = fs.readFileSync(path.join(config.root, 'public/not-found.html'), 'utf-8');
const html418 = fs.readFileSync(path.join(config.root, 'public/teapot.html'), 'utf-8');

// GET /:app/
// different subdomains gets different file, reload-able cached html content
// serverPath is absolute
type IndexFiles = { [subdomain: string]: { readonly serverPath: string, content: string | null } }
const indexFiles: IndexFiles = ['www'].concat(config.apps).reduce<IndexFiles>(
    (acc, app) => { acc[app] = { serverPath: path.join(config.root, `${app == 'www' ? 'home' : app}/index.html`), content: null }; return acc; }, {});
async function handleRequestIndexFile(ctx: koa.Context) {

    const app = ctx.subdomains.length == 0 ? 'www' : ctx.subdomains[0];
    if (app in indexFiles) {
        if (indexFiles[app].content === null) {
            indexFiles[app].content = await fsp.readFile(indexFiles[app].serverPath, 'utf-8');
        }
        ctx.type = 'html';
        ctx.body = indexFiles[app].content;
    } else {
        ctx.redirect(`/404`); // NOTE: this is actually unreachable, because unknown subdomains are rejected by browser when certificating
    }
}

// GET /:app/:path
// reload-able cached js/json/css/image content, cache key is `/${app}/${filename}`
// if not match, try to load public files, which every time check file existence and read file and send file
type StaticFiles = { [key: string]: { readonly serverPath: string, readonly contentType: string, content: string | null } }
const staticFiles: StaticFiles = config.apps.reduce<StaticFiles>((acc, app) => { 
    acc[`/${app}/index.js`] = { serverPath: path.join(config.root, `${app}/client.js`), contentType: 'js', content: null };
    acc[`/${app}/index.js.map`] = { serverPath: path.join(config.root, `${app}/client.js.map`), contentType: 'json', content: null };
    acc[`/${app}/index.css`] = { serverPath: path.join(config.root, `${app}/index.css`), contentType: 'css', content: null };
    return acc;
}, {
    '/www/index.js': { serverPath: path.join(config.root, 'home/client.js'), contentType: 'js', content: null }, // only home page index js does not have source map
    '/www/index.css': { serverPath: path.join(config.root, 'home/index.css'), contentType: 'css', content: null },
});
async function handleRequestStaticFile(ctx: koa.Context) {
    const key = `/${ctx.subdomains.length == 0 ? 'www' : ctx.subdomains[0]}${ctx.path}`;
    
    // static file
    if (key in staticFiles) {
        if (staticFiles[key].content === null) {
            staticFiles[key].content = await fsp.readFile(staticFiles[key].serverPath, 'utf-8');
        }
        ctx.type = staticFiles[key].contentType;
        ctx.body = staticFiles[key].content;
        return;
    }

    // reject .html and redirect to 404
    if (path.extname(ctx.path) == '.html') {
        ctx.redirect('/404');
        return;
    }

    // check file existance and read file, or return 404 for not found file
    if (fs.existsSync(path.join(config.root, 'public', ctx.path))) {
        ctx.type = path.extname(ctx.path);
        ctx.body = await fsp.readFile(path.join(config.root, 'public', ctx.path));
    } else {
        ctx.status = 404;
    }
}

export async function handleRequestContent(ctx: koa.Context, next: koa.Next) {
    if (ctx.subdomains.length == 1 && ctx.subdomains[0] == 'api') { return await next(); } // goto api
    if (ctx.method != 'GET') { throw new MyError('method-not-allowed'); } // reject not GET 
    // all of the remainings do not need next

    if (ctx.path == '/404') { ctx.type = 'html'; ctx.body = html404; return; } 
    if (ctx.path == '/418') { ctx.type = 'html'; ctx.body = html418; return; }

    if (ctx.path == '/') { 
        await handleRequestIndexFile(ctx); 
    } else {
        await handleRequestStaticFile(ctx);
    }
}

export function handleAdminContentUpdate({ app, name }: AdminContentUpdateParameter) {
    logInfo({ type: 'content-update', value: { app, name }});

    if (name == 'index.html') {
        if (app in indexFiles) {
            indexFiles[app].content = null;
        } // else ignore
    } else { // other js/css
        if (`/${app}/${name}` in staticFiles) {
            staticFiles[`/${app}/${name}`].content = null;
        } // else ignore
    }
}
