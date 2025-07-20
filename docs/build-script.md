# Build Script

build script builds, deploys and maintenances the whole project and related projects, which

- build, deploy and debug core module
- build and deploy builtin pages include main and user page
- deploy public assets
- other devops like lint
- provide cli to forward other administration commands
- provide a server executable file to be run on deployment environment, which
  - provide debug and manage interface for core process, in a really strange way to increase safety
  - forward administration commands to core process and backward(?) results from core process
  - host core process for actual debug experience
- provide build script tools for use in apps development process, which
  - supports more "traditional" webpack bundler for front end pages
  - deploy and hot reload front end build artifacts
  - rpc style api declaration, code generation and support library

in additional

- all executable files are all called `akari`, あっかりんーー
- build script is invoked directly, that is *8* characters
  less then `npm run akari args` and *5* characters less than `node akari args`
- build script is written in typescript and it is build by itself, to prevent bootstrap issues,
  this project tracks the executable file in version control, while bootstrap shell script is still prepared for apps
- apps can write their own build process (even a similar administration interface like in this project)
  but some common things are still described here

## CLI Reference

(maybe incomplete, maybe out of date)

```bash
# basic
$ akari self
$ akari public
$ akari core
$ akari watch core
$ akari static
$ akari watch static

# authentication
$ akari enable-signup
$ akari disable-signup
$ akari disable-user 3
$ akari enable-user 3
$ akari expire-device 3

# core process service
$ akari service start
$ akari service status
$ akari service stop
$ akari service restart
$ akari service is-active
```

akari (server) should run as background service

## No Build Config File

normally you will have many config files in a typical web app project,
include `tsconfig.json`, `webpack.config.js`, `.babelrc`, `eslintrc`, etc.,
maintaining them is already very hard and harder with the fact that
webpack is too complex and need to learn again to update related configurations.

the situation is worse in monorepo that these files are needed for all targets,
some of the targets does not need some of the files, some types of the files are very
similar but do need essential difference, some types of the files support reuse while
some does not consider monorepo at all, these issues makes maintaining configuration
files in monorepo not suitable for human especially in early development phase with
frequent changes include large architecture changes.

this build script, instead of normal approach, uses all tools' node api to construct a single script,
because nearly all modern front end engineering tools have node api, because most of them want to
integrite with webpack which requires adapting their node api with webpack's api, while many tools have
standalone command line interface, a well-designed internal structure will separate a node api to be
shared between cli and webpack api, webpack itself also have very powerful and complex node api for sure. 

in detail,
- typescript: use compiler api, not `ts-loader` or `awesome-typescript-loader`, 
  because both of them do not support no-config-file usage, while compiler api supports
- sass: use it's own node api instead of `sass-loader!css-loader!style-loader`
  (the exclamation mark is how these series of loaders display in webpack statistics),
  because I'd like to compare this usage to commonly used 'bundle-css-in-js' pattern
- backend is not using webpack, see following section
- web pages are not using webpack, because they only have
  one ts file and it is tranpiled into javascript and served
- front end webpack configuration is inlined in build script source code
- eslint node api supports no-config-file usage, actually its command line interface also supports it

> vscode eslint is disabled in editor's config because it is annoying in many cases,
  while vscode have many unexpected or not-designed behavior facing mono repo,
  especially this mono repo without tsconfig, like its hinting browser javascript
  global variables in backend code, or complains unknown variable which is implemented
  by typescript custom transformer in build script

> update: vscode have provided some more configurations like 'js/ts.implicitProjectConfig.*', which
  should be designed for "simple projects without tsconfig", this helps a little but not much,
  actually currently I found that append @ts-ignore directly is more convenientand actually more
  suitable for not important some false positives.

## Targets

### self

self and other backend targets are bundled with `mypack` bundler, not webpack, because
I was experiencing serious performance issues on my deployment environment using webpack
and typescript watching and rebuilding.

It starts from a very simple text joiner to a not very simple but still simple text joiner
with source map, minify, etc. features, this bundler read file from memory, recognizes
all `require(".` and replace them with `myimport`, module id (module name) is relative path
to entry, then join them and generate source map by the way, finally minified if configured,
this showed that the core functionality of a bundler is not that complex and mysterious.

### core

the core module, the actually implementation for static file, authentication and rpc support,
see admin server part for more about admin interface and debug host

### public

deploy public files (copy all files via ssh based ftp)

### static

build builtin pages (home page and user page), home page is now a single standalone html page,
user page implements login and sign up part for authentication, may be used by apps

user page now uses react for ui, while react 17.0.1 introduces the
[new jsx transform](https://reactjs.org/blog/2020/09/22/introducing-the-new-jsx-transform.html),
which is great readability improvement because no bundler is involved and browser
and devtools gets typescript transpile result

### app

TODO use make-akari.ts to assmeble other repository's akari.ts
compare original makelink and add their own script folder and target.ts and index.ts and bootstrap workflow

app ui and backend target is not available in this project, they need to
access script/tools and src/adk and some other files or directories to work

- it is not suitable to submodule app projects in this project, because it is really strange
  to include apps in a reverse proxy project, I did not split them to include them together again
- it is not suitable to submodule this project in app projects, because this project contains
  some other things not used in app, like core module and akari (server) source code
- it is not very suitable to split shared files into another repository, because
  at first, app repos need script/tools, and they need admin command declarations, while some
  of admin interface implementation is in akari (server), it should also include akari (server),
  move the complete script part into separate repo makes this repo kind of empty (only core module
  and static pages) while actually static content implementation, admin interface implementation is
  tightly coupled with logics in build script, so split repo approach is also not good

and the final (currently) solution is to symbolic link related directories and files into
app's development directory, it prevents the "forget to deploy adk" error in current akari (app)
implementation (although this have never been mentioned in script)

mapped directories and files include

- `script/tools`, combinator part of build script
- `src/adk`, rpc(api) related common logics
- `script/common.ts`, common utilities used in script/tools
- `src/shared/auth.d.ts`, authentication related types used in rpc
- `src/shared/admin.d.ts`, admin command types, although apps only
   need several commands, it is strange to split them into multiple files

the deploy script is in `script/makelink`, which is a bash script and not need transpile

## Administration Interface

// TODO this is now remote command center architecture

I have no traditional administration page (mainly for security reasons),
but admin operations is actually needed so they are implemented in a very starge way.

an admin command is normally sent by akari (local),
handled and forward by akari (server) or handled by core module

### akari (server)

akari (server) is another self target of build script,
it runs on deployment environment works as a background service,
it is actually a http server and websocket server handling custom requests,
it is not integrited with core module is for hot reload and self host features.

### Hot Reload

although the core module is very small and starts up really quickly, it is still
not convenient and suitable to restart the core process everytime any change happens,
so there is hot reload mechanism for everything other than core functionality

for app servers, they are in separate process, see build-script.md and rpc.md for detail

for builtin web pages and other app's web pages, they are frequently accessed while
require immediate update after new build result deployed, the common and widely used
approach is file system watchers, *BUT* they are not stable, not compatible
between platforms (although I have never planned to run this server on Windows or Mac OS,
but most part of this project should be platform independent) and complex to use, so
I'm using an admin command to try to reload new contents instead of using any operating
system provided file system watching mechanism, see src/core/content.ts for detail

webpack dev server has the feature to hot reload css or reload page for javascript changes,
it is actually not hard to add to app's build process

> but it is not that simple regarding the web browser is opened on local environment (the same
  machine runs akari (local)), while at some other time I need to test web pages on mobile
  device, akari (local) and the web page still need a well known address to communicate with,
  and that is exactly the akari (server)

1. a `client-dev.js` is served from akari (server), containing dev mode code,
   this element is added by when watching app's ui target, by pretending there is additional build result
2. the code will connect to the websocket server (also hosted by akari (server)) and reads
   reload command from akari (server) forwarded from akari (local), one of
   - `reload-all` refresh the complete page
   - `reload-css` which removes the css link element and adds back again, the css file is marked 'must-validate' cache control and will be reload by browser

there is no cli interface for this reload command because it is integrited in building process

## RPC API Framework

it is common for app to have backend and provide web api

app servers were originally designed to be in-process and loaded by simple `require` function,
but new apps become complex and have its own other services to host, it is hard to unload
the services (incorrect unload leads to memory leak, resource leak or error (like port in use)),
and critical error makes the core module unstable (unhandled error and unhandled rejection leads to restart),
so these new apps are deployed on their own, communicating with core process by domain socket, sending
json as plain text, the socket connections are pooled to prevent frequent open and close

> this is also why this project is categoried from "website" to "reverse proxy"

and writing api declaration twice (or sometimes more times) in front end and back end is boring and error prone,
so there is code generation part to make front end calling back end looks like a function call (like *rpc*)

### File Upload

to prevent large file to be transmitted through domain socket, it is saved to real file system and send a path,
app server may delete the file after use, or rename to its own place to keep it, core module will delete these
files after, like 1 month, there should be no app server need them after this long time

### File Download

to prevent large file to be transmitted through domain socket, also implementing (should be) commonly used
cache feature, core module knows all (will download) file requests (in memory and persist storage) and will
not call app server when cache is fresh, use rename instead of copy by requesting app server's saved file's
ownership will reduce one file copy, app servers use websocket's reverse domain socket to request for a slot
for a file request, a slot (not the cache) is permanent for path (url path) in specific app, so furthur request
(app server does not need to save the mapping for slot id and path) will only return previously allocated slot id,
use slot id not path (include file name) will make the request look good (content.domain.com/{guid}) also prevent
malisious (maybe not, just curious) try file path attempt, limiting content request to my own website only

### TODO Streaming Response

although streaming response is not powerful as websocket, but LLM AI streaming completion need this

### Alive Connection

I mean websocket, websocket will be implemented as 2 separate domain socket connection for different direction, the
authentication part can be done via send access-token in Sec-Websocket-Protocol header, which is the only allowed
customizable header in websocket's http upgrade request, custom header is not allowed, body is not allowed, and cookie
is not available while cross origin (TODO: determine whether this part should be in auth.md), websocket is useful
for both current actively developing apps

### Public API

public api is be provided at `api.domain.com/public/<app>/v1/`, not `api.domain.com/<app>/v1/public` because it is
not easy and duplicate work to parse version segment, `api.domain.com/<app>/public/v1` is strange, rate limiting may
not only be applied on public api because a native http client is very capable of pretending formal web site, I'd
like adding some strange requirement to request to prevent easy frequent access from browser or simple script code,
like strange header, or even token for public

### Rate Limit

TODO update according to current implementation

rate limit: see https://www.nginx.com/blog/rate-limiting-nginx/, I'd prefer burst=20+nodelay, which limits like 
1 request per second, but permits 20 requests burst, that is 21 request come at one time (in one second), they
are allowed to forward, but additional requests will allocate slot in bucket, and they deallocate after rate
interval, in this case, deallocate one by 1 second, note that expire time is determined at allocation time, because
duration the deallocation interval new burst may come and you can not simple deallocate one per second, and
more request (bucket overflow) will simple throw 503 service unavailable with message bucket overflow at caller,
the leaky bucket's leaky part is actually discard access record in previous duration when previous duration expires,
which implements constant leak rate, CLR(?), this rate limit is applied in forward.ts, and underlying algorithm
is abstracted and put in adk

TODO update to current implementation

first, `api.xml`
```xml
<xs:element name="api">
  <xs:complexType>
    <!-- default to 'default' -->
    <xs:attribute name="namespace" type="xs:string" />
    <!-- is script function name, so cannot have whitespace or hyphen -->
    <xs:attribute name="name" type="xs:string" use="required" />
    <!-- can be GET|PUT|POST|PATCH|DELETE -->
    <xs:attribute name="method" type="xs:string" use="required" />
    <!-- is normal url path with optional `{name:type}` segament -->
    <!-- name cannot have whitespace or hypthen, type is limited to id|number|string|boolean|date|datetime -->
    <xs:attribute name="path" type="xs:string" use="required" />
    <!-- required when method is PUT|POST|PATCH -->
    <xs:attribute name="body-type" type="xs:string" />
    <!-- required when method is PUT|POST|PATCH -->
    <xs:attribute name="body-name" type="xs:string" />
    <!-- default to void -->
    <xs:attribute name="return-type" type="xs:string" />
  </xs:complexType>
</xs:element>
```

app's can invoke code generation tools for generate front end and backend code,
backend code is now inverted to declare an interface to dispatch and let caller to implement the interface

## Security Considerations

1. akari (server) can only start by hand and auto shutdown after 3 hours of inactivity (3 hour is, I think, the longest time I will spend thinking or write raw code while developing)
2. client my code source map (include source content) is served only when akari (server) is on, vendor source map is not generated or served because of performance not security
3. it does not use api (app-server)'s authentication machenism but require commands to be encrypted, the symmetric encryption key is generated when akari (server) starts and store in a file and download through ssh by akari (local)
4. javascript files are not sent through http connection but only sftp connection, because it is dangerous to deploy exectuable files through unauthenticated connection
5. log files are not downloaded through http connection but only sftp connection, because they may expose server important internal values
6. add special changing header value to make non official native client hard?
