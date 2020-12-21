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

### Routes

1. regex input is `${method} /${subdomain}${path}`
2. no subdomain is `${method} /www/${path}` (www.domain.com and domain.com is not same origin, but here is convenient and reasonable to regard them same)

- GET /any/404 => dist/main/404.html  
- GET /any/418 => dist/main/418.html

- GET /any/w => dist/main/user.html
- GET /any/user.js => dist/main/user.js
- GET /www/ => dist/main/index.html
- GET /:app/ => dist/:app/index.html
- GET /www/:path => known dist/main/ files, or else dist/public/:path
- GET /:app/:path => known dist/app/ files, or else dist/public/:path

- POST /api/login
- GET /api/user-credential
- GET /api/user-devices
- PATCH /api/user-devices/:deviceid
- DELETE /api/user-devices/:deviceid
- METHOD /api/app/version/:function => app server api

- GET /share/:path => /api/save/share/:path (TBD)
