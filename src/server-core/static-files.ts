import * as fs from 'fs';
import * as path from 'path';
import * as express from 'express';
import { AdminReloadParameter } from '../shared/types/admin';

const distDirectory = path.join(process.cwd(), 'dist');

// GET /404 and GET /518
// return non-reload-able static stand alone html text
const html404 = fs.readFileSync(path.join(distDirectory, 'home/404.html'), 'utf-8');
const html518 = fs.readFileSync(path.join(distDirectory, 'home/518.html'), 'utf-8');
export function handle404(_request: express.Request, response: express.Response) {
    response.contentType('html').send(html404).end();
}
export function handle518(_request: express.Request, response: express.Response) {
    response.contentType('html').send(html518).end();
}

// GET /
// different subdomains gets different file, reload-able cached html content
type IndexFiles = { [subdomain: string]: { filepath: string, content: string | null } }
const indexFiles: IndexFiles = (() => {
    const indexFiles: IndexFiles = {}; // this amazingly works
    // 2 home page properties (domain.com and www.domain.com) share same value to prevent duplicate fs read
    const homePageEntry = { filepath: path.join(distDirectory, 'home/index.html'), content: null as string };
    for (const subdomain of ['www', 'undefined']) { // 'undefined' create by `${subdomain[0]}` when subdomain list is empty
        indexFiles[subdomain] = homePageEntry;
    }
    for (const name of ['cost', 'drive']) {
        indexFiles[name] = { filepath: path.join(distDirectory, `${name}/index.html`), content: null };
    }
    return indexFiles;
})();
export function handleIndexPage(request: express.Request, response: express.Response, next: express.NextFunction) {
    const key = `${request.subdomains[0]}`;
    if (key in indexFiles) {
        if (indexFiles[key].content === null) {
            indexFiles[key].content = fs.readFileSync(indexFiles[key].filepath, 'utf-8');
        }
        response.contentType('html').send(indexFiles[key].content).end();
    } else {
        next(); // this currently will not happen and if happen will goto 404
    }
};

// GET static.domain.com/xxx
// reload-able cached js/json/css content
// amazingly <script> tag and <link rel="stylesheet"> tag defaults to ignore cross origin check
type StaticFiles = { [filename: string]: { filepath: string, contentType: string, content: string | null } }
const staticFiles: StaticFiles = (() => {
    const staticFiles: StaticFiles = {};
    staticFiles['index.js'] = { filepath: path.join(distDirectory, 'home/client.js'), contentType: 'js', content: null }; // only home page index js does not have source map
    staticFiles['index.css'] = { filepath: path.join(distDirectory, 'home/index.css'), contentType: 'css', content: null };
    for (const name of ['cost', 'drive']) {
        staticFiles[`${name}.js`] = { filepath: path.join(distDirectory, `${name}/client.js`), contentType: 'js', content: null };
        staticFiles[`${name}.js.map`] = { filepath: path.join(distDirectory, `${name}/client.js.map`), contentType: 'json', content: null };
        staticFiles[`${name}.css`] = { filepath: path.join(distDirectory, `${name}/index.css`), contentType: 'css', content: null };
    }
    return staticFiles;
})();
export function handleStaticFiles(request: express.Request, response: express.Response, next: express.NextFunction) {
    if (request.subdomains[0] !== 'static') { // also correct for subdomains array is empty
        next();
    } else if (!(request.params['filename'] in staticFiles)) {
        response.sendStatus(404).end(); // unknown static file is status 404 instead of 404 html page
    } else {
        const entry = staticFiles[request.params['filename']];
        if (entry.content === null) {
            entry.content = fs.readFileSync(entry.filepath, 'utf-8');
        }
        response.contentType(entry.contentType).send(entry.content).end();
    }
}

export function handleReload({ type, name }: AdminReloadParameter) {
    if (type == 'index') {
        if (name in indexFiles) {
            indexFiles[name].content = null;
        }
    } else if (type == 'static') {
        if (name in staticFiles) {
            staticFiles[name].content = null;
        }
    }
}
