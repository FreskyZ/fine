# File Structure

- `akari`: the build script executable, it is complex to bootstrap so it is tracked by version control
- `akaric`: the build script configuration, it is not tracked, see `script/config.ts`
- `script`: source of the build script, see more at [build-script.md](./build-script.md)
  - `script/index.ts` is the (client side) build script entry
  - `script/server/index.ts` is the (server side) management utility entry
- `src`: normal source code, or 'runtime' related source code
  - `core`: server entry, certificate, cache control and authentication
  - `home-page`, `user-page`: the two special simple pages are in tree
  - `public`: not interesting public files like `robots.txt`, they are copied to distribution location as-is
  - `shared`, `wimm`: TBD?
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
