# File Structure

## build
build intermediate result, maybe used as build cache, not tracked by git

## dist
the website itself, dist means it can be copied to elsewhere to run, tracked by git

### dist/home
contains home page and server entry `nodejs dist/home/server.js`,
change to server entry requires server restart, change to home page `index.html` requires admin script.

### dist/public
contains not interesting things at `/*`, like `robots.txt` and `sitemap.xml`,
all subdomains can access these files, content is dynamic (can hot add or remove file) and always read from disk (can hot update file),
except html files, because server route like /xxx/xxx.html looks not good, they should be served without .html postfix

### dist/\<app\>
contains application's main page `index.html`, application server entry `server.js` and web page content `js`/`css` files,
web page contents are also served at `/*` at their own subdomain, mixed with shared public files,
add, remove or update web page content file list or file content requries admin script.

_admin script_ is a shell script execute on this machine (where server is running), 
which uses IPC to control server behavior.

## logs
runtime logs, now only support download and remote analysis, no admin page provided

## script
build script, invoke typescript compiler and webpack directly to implement complex build process,
also include other dev tool configs like eslint.

## src

### src/server-core
server entry, environment setup, application hot reload support

### src/home-page
home page, home page is manual html, css and js

### src/\<app\>
application server and client, index.html is outside of client/server folder because it is just a placeholder (react root holder)

### src/shared
shared types, component and logics by all of the above, regardless of client of server
