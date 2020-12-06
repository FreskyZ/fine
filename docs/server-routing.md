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

### Routes

- regex input is `${method} /${subdomain}${path}`
- no subdomain is `${method} /www/${path}` (www.domain.com and domain.com is not same origin, but here is convenient and reasonable to regard them same)

GET /www/ => dist/home/index.html
GET /:app/ => dist/:app/index.html
GET /any/404 => dist/public/not-found.html
GET /any/418 => dist/public/teapot.html
GET /www/:path => dist/public/:path except html or known dist/home/ files
GET /:app/:path => dist/public/:path except html or known dist/home/ files

POST /www/login => login
POST /www/refresh-token => refresh access token
GET /api/user-credential => get user credential
METHOD /api/app/:function => app server api

GET /share/:path => /api/save/share/:path (TBD)
