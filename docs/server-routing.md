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

Worth-noting routes

- `app.example.com` hosts some of the apps
- `chat.example.com` is the ai ui project `https://github.com/FreskyZ/small/blob/main/theai`,
  `chat.example.com/s` is public share page, e.g. `https://chat.example.com/s?id=12345678-9A-BC-DE-FGHIJKLM`
- `note.example.com` is the new note taking app `https://github.com/FreskyZ/small/blob/main/thenote`
- `drive.example.com` is the another file stroage app
- `ai.example.com` is ?
