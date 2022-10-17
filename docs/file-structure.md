# File Structure

- `akari`: the build script executable, it is complex to bootstrap so it is tracked by version control
- `akaric`: the build script configuration, it is not tracked, see `script/config.ts`
- `script`: source of the build script, see more at [build-script.md](./build-script.md)
  - `script/index.ts` is the (client side) build script entry
  - `script/index-server.ts` is the (server side) management utility entry
  - `script/index-app.ts` is app's build script entry
- `src`: normal source code, or 'runtime' related source code
  - `core`: server entry, certificate, cache control and authentication
  - `public`: not interesting public files like `robots.txt`, simply copied to distribution location
  - `static`: some builtin pages like home page and user page (to work with backend authentication)
  - `adk`: application software development kit, app's client and server border will use these types and functions
  - `shared`: shared types for admin/auth, they are now linked to app, too
  - `shared/config.json`: core module's runtime config file, it is not in src/core because src/core is
    very cool because it only contains several files with short names and same file extension, put either 'config'
    or 'config.json' in the directory both reduces the cool level, while it is actually kind of reasonable
    because this runtime config is somehow shared by core module and akari (server)
  - (not in tree) web app's source code: in their own repository while only shares build script

### Distribution Directory Structure

- `akari`: the management utility, helper for deployments and debug process and proxy for all admin commands
- `index.js`: the server entry
- `public`: not interesting public files, same as `src/public`, not cached in memory and use weak cache policy
- `static`: other build result (except `src/core`) html/js/css files (also source map), 
  they are cached in memory and use strong cache policy, while watch file system is unstable,
  not compatible and affect performance, they are hot reloaded by admin command not watch file system
  - `static/index.html`, `static/user.html` the two special simple pages are directly in `static` directory
  - `static/<app>` each app's front end files are in their own directory to resolve name collision
- (not in same directory) app's server is deployed and run separately

### `public` or (or and) `static`

it seems that people have not make consensus about which to use for "static files"

> you will find a lot about Java's keyword and syntax
> if search for 'public or static', you need something like 'public folder or static folder'

- [expressjs](http://expressjs.com/en/starter/static-files.html)
  api is called `express.static` but the example directory is `public`
- [nextjs](https://nextjs.org/docs/basic-features/static-file-serving)
  require directory name to be `public` and cannot be configured, only build result will be served and external files ignored
- [create-react-app](https://create-react-app.dev/docs/using-the-public-folder/)
  creates a `public` directory and configured webpack to put build result into this directory, with capability of replacing `script` tag in html file in this directory
- [gatsbyjs](https://www.gatsbyjs.com/docs/how-to/images-and-media/static-folder/)
  put build result into `public` directory while says you can put external file into `static` directory and they will be copied to `public` directory when build
- [Vue CLI](https://cli.vuejs.org/guide/html-and-static-assets.html#disable-index-generation) uses `public`
- [django](https://docs.djangoproject.com/en/4.1/howto/static-files/)
  uses config `STATIC_URL` and `STATICFILES_DIRS` and the example uses `static`
- [ASP.NET Core](https://docs.microsoft.com/en-us/aspnet/core/fundamentals/static-files?view=aspnetcore-6.0)
  api is called `UseStaticFiles` and example uses `css`/`html`/`images`/`js` or `StaticFiles`?

so to make things worse(), I use *both* in source directory to distinguish "boring" files, and use *both* in distribution directory to distinguish different cache strategy
