# File Structure

- `akari`: the build script executable, it is complex to bootstrap so it is tracked by version control
- `akaric`: the build script configuration, it is not tracked, see `script/config.ts`
- `script`: source of the build script, see more at [build-script.md](./build-script.md)
  - `script/index.ts` is the (client side) build script entry
  - `script/index-server.ts` is the (server side) management utility entry
  - `script/index-app.ts` is app's build script entry
- `src`: normal source code, or 'runtime' related source code
  - `core`: server entry, certificate, cache control and authentication
  - `public`: simple public files like `robots.txt`, they are simply copied to deployment location
  - `static`: builtin pages include the home page and authentication related pages
  - `adk`: application software development kit, app's client and server border will use these types and functions
  - `shared`: shared types for admin/auth, they are now linked to app, too
  - `shared/config.json`: core module's runtime config file, it is not in src/core because src/core is
    very cool because it only contains several files with short names and same file extension, put either 'config'
    or 'config.json' in the directory both reduces the cool level, while it is actually kind of reasonable
    because this runtime config is somehow shared by core module and akari (server)
  - (not in tree) web app's source code: in their own repository while only shares build script

### Deployment Directory Structure

- `akari`: the management utility, helper for deployments and debug process and proxy for all admin commands
- `index.js`: the server entry
- `public`: not interesting public files, same as `src/public`, not cached in memory and use weak cache policy
- `static`: meaningful web apps/pages html/js/css files (also source map),
  they are cached in memory and use strong cache policy,
  because watch file is proved to be unstable, not compatible and affect performance, they are hot reloaded by admin command
  - the home page `static/index.html` and authentication related pages like `static/user.html` are directly in `static` directory
  - other apps use their own `static/<app>` folder
- (not in same directory) app's server is deployed and run separately

### `public` or (or and) `static`

The naming conventions for directories serving static files vary across frameworks and tools:

- [Express.js](http://expressjs.com/en/starter/static-files.html): The API is named `express.static`, but the example directory is `public`.
- [Next.js](https://nextjs.org/docs/basic-features/static-file-serving): Requires the directory to be named `public` (non-configurable); only build outputs are served, and external files are ignored.
- [Create React App](https://create-react-app.dev/docs/using-the-public-folder/): Uses a `public` directory, with build outputs placed there and support for injecting scripts into HTML files within this directory.
- [Gatsby.js](https://www.gatsbyjs.com/docs/how-to/images-and-media/static-folder/): Outputs build results to a `public` directory, but allows placing external files in a `static` directory, which are then copied to `public` during the build process.
- [Vue CLI](https://cli.vuejs.org/guide/html-and-static-assets.html#disable-index-generation): Uses a `public` directory for static assets.
- [Django](https://docs.djangoproject.com/en/4.1/howto/static-files/): Uses configuration variables such as `STATIC_URL` and `STATICFILES_DIRS`, with examples referencing a `static` directory.
- [ASP.NET Core](https://docs.microsoft.com/en-us/aspnet/core/fundamentals/static-files?view=aspnetcore-6.0): The API is `UseStaticFiles`, and examples use directories like `css`, `html`, `images`, `js`, or `StaticFiles`.

Given these inconsistencies, this project adopts both `public` and `static` directories in the source tree to distinguish between different types of files (e.g., "boring" files vs. application assets). Both are also used in the distribution directory to implement distinct caching strategies.
