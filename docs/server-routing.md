# Server Routing

There are multiple sites hosted on this service, they have different domains, subdomains and pathnames. This
document *was* used to describe precisely how each request is handled, but they are too many and often change,
so they are now in configuration, making this document and content handling in core module simpler.

Remaining routes in the core module

- `example.com` is an empty placeholder home page, server `src/static/home.html`
- `www.example.com` is redirected to `example.com`
- `id.example.com` is the identity provider ui
- `api.example.com` is the only domain to handle non-GET requests
- `api.example.com/user-credentials`, etc. is authentication related api
- `api.example.com/appname/...` is application's api
- 404, `src/static/404.html` is available in `example.com/404` and some other locations
- public files, `favicon.ico`, `robots.txt` is available at all locations as fallback
- `shortexample.com` hosts a short link service
