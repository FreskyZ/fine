# Server Routing

### Background

> It proves that express (expressjs/express) is kind of complex and difficult to update when server routing becoming complex, 
  e.g. now (a72827e) I need to move `/login` and `/refresh-token` from api subdomain to no subdomain, 
  but I cannot easily figure out where to insert it, actually it is kind of difficult to determine how's these 
  helper middlewares, static file middlewares, route handlers and error handlers, etc. executed.

> So I decided to turn to koa (koajs/koa) which is basically a middleware host and even 
  routing is not provided in core functionalities, and use regular expressions to dispatch handlers, 
  koa router (ZijianHe/koa-router) is also using regex but that is generic and more express style, 
  I'm not using it in server-core but may use them in app servers.

> (updated) after refactor finish, I actually use naive operations for server-core and should use regex for apps

### Features

1. multiple sites
   1. a main site hosting all web apps, call `domain.com` in following content
   2. an interesting static multi page site, call `happy.net`
   3. a short url service, call `short.link`
2. multiple web apps
   - web apps call `app.domain.com`
   - their static file are at `app.domain.com/filename`
   - api at `api.domain.com/app/path`, all api (except login) require logged in

### Routes

1. original http request is in form `METHOD 3LD.2LD.TLD/PATH`, where
   - `METHOD`: GET | POST | PUT | PATCH | DELETE | OPTION
   - `3LD`: 3rd level domain, or normally called subdomain, optional, may be `www` or app name
   - `2LD`: 2nd level domain, or normally called domain, the one you need to pay for use, may be `domain`, `happy` or `short`
   - `TLD`: top level domain, may be `com`, `net` or `link`
   - `PATH`: optional, may be file name or api path
   interest site is actually one or several web pages with different domain, short link service is actually a web app with different domain
2. prefer non-`www` to `www` so permanent redirect them to non-`www` version

- `GET domain.com/404` => webroot/pages/404.html
// `GET app.domain.com/404` is not here, web apps are single page and front end router will handle unknown page
- `GET happy.net/404` => webroot/pages/404.html
// GET short.link/404 is not here, it displays its own file not exist/expire error page
// GET api.domain.com/404 is not here, it cannot pass authentication and return 401

// this easter egg previously exists for all route beside 404, now short.link is introduced so it is limited only in short.link
- `GET short.link/418` => webroot/pages/418.html

// public static files, file may have path, that also maps to physical path in server file system
// this is also required by letsencrypt which puts file in public directory and expect to GET them
- `GET domain.com/file` => webroot/public/file
- `GET app.domain.com/file` => webroot/public/file
// that is also the site because it is static multi page
- `GET happy.net/file` => webroot/public/file
// when certificating, it will not check db but only try return public static file,
// other files, like robots.txt, are not important and not provided
- `GET short.link/file` => shared object or default to webroot/public/file

// index pages
- `GET domain.com` => webroot/pages/main.html
- `GET domain.com/index.css` => webroot/pages/main.css
- `GET happy.net` => webroot/pages/happy.html
- `GET happy.net/index.css` => webroot/pages/happy.css
- `GET short.link` => webroot/pages/short.html  // simply says: no, this is private (you cannot share your own file even login), contact site owner for more info

// app pages (all apps are single page so only one html file and a user setting file)
- `GET app.domain.com` => webroot/app/index.html
- `GET app.domain.com/index.css` => webroot/app/index.css
- `GET app.domain.com/client.js` => webroot/app/client.js // or client-vendor.js, or client.js.map
- `GET app.domain.com/m` => webroot/pages/user.html
- `GET app.domain.com/user.js` => webroot/pages/user.js
- `GET app.domain.com/user.css` => webroot/pages/user.css

// rest part is api
- `METHOD api.domain.com/special-operations` => login, get user info, etc. see authentication.md
- `METHOD api.domain.com/app/version/path` => normal api forwarded to app server

3. about not found // TODO try use referer

- `METHOD api.domain.com/any-not-expected` => status 404
- `GET short.link/any-unknown` => short link service displays its own not found page
- all others => permanent redirect to `/404`
