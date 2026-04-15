# File Structure

file structures of...

## Source Code

- `akari.ts`: the build script executable, see [build-script.md](./build-script.md)
- `script`: the build sript source files
- `setup`: files to build docker images and containers
- `src`: normal source code, or 'runtime' related source code
  - `core`: server entry, certificate, cache control and authentication
  - `config`: config files templates used by different services
  - `public`: simple public files like `robots.txt`, they are simply copied to deployment location
  - `static`: builtin pages include the home page and authentication related pages
  - `shared`: shared types for admin/auth, they are now linked to app, too
  - `servers`: builtin content servers or action servers

## Main Container

- `akari.ts`: the management utility, which is same as `script/remote-akari.ts`
- `index.js`: the server program
- `public`: not interesting public files, same as `src/public`, not cached in memory and use weak cache policy
- `static`: meaningful web apps/pages html/js/css files (also source map),
  they are cached in memory and use strong cache policy,
  because watch file is proved to be unstable, not compatible and affect performance, they are hot reloaded by admin command
  - the home page `static/index.html` and authentication related pages like `static/user.html` are directly in `static` directory
  - other apps use their own `static/<app>` folder
- `servers`: location of in process servers
- `/var/log/fine`: logs directory
- `/run/fine/fine.socket`: admin interface socket
- `/etc/fine`: config files directory
  - `akari.yml`: remote akari configuration, the same file is also in the same location in local environment for local akari
  - `certbot.yml`: certbot configuration, currently only for the dns plugin, see more in certification.md
  - `domains.yml`: certificate configuration, use by both certificate renew container and core container
  - `content.yml`: static content and external content providers configuration
  - `access.yml`: access control configuration and proxied services configuration

### More about `public` and `static`

The naming conventions for directories serving static files vary across frameworks and tools:

- [Express.js](http://expressjs.com/en/starter/static-files.html):
  The API is named `express.static`, but the example directory is `public`.
- [Next.js](https://nextjs.org/docs/basic-features/static-file-serving):
  Requires the directory to be named `public` (non-configurable); only build outputs are served, and external files are ignored.
- [Create React App](https://create-react-app.dev/docs/using-the-public-folder/):
  Uses a `public` directory, with build outputs placed there and support for injecting scripts into HTML files within this directory.
- [Gatsby.js](https://www.gatsbyjs.com/docs/how-to/images-and-media/static-folder/):
  Outputs build results to a `public` directory, but allows placing external files in a `static` directory, which are then copied to `public` during the build process.
- [Vue CLI](https://cli.vuejs.org/guide/html-and-static-assets.html#disable-index-generation):
  Uses a `public` directory for static assets.
- [Django](https://docs.djangoproject.com/en/4.1/howto/static-files/):
  Uses configuration variables such as `STATIC_URL` and `STATICFILES_DIRS`, with examples referencing a `static` directory.
- [ASP.NET Core](https://docs.microsoft.com/en-us/aspnet/core/fundamentals/static-files?view=aspnetcore-6.0):
  The API is `UseStaticFiles`, and examples use directories like `css`, `html`, `images`, `js`, or `StaticFiles`.

Given these inconsistencies, this project adopts both `public` and `static` directories in the source tree to distinguish
between different types of files (e.g., "boring" files vs. application assets). Both are also used in the distribution directory to implement distinct caching strategies.
