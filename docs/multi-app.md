# Multi App Structure

ATTENTION WORK IN PROGRESS

app servers were originally designed to be in-process and loaded by simple `require` function,
but new apps become complex and have its own other services to host, it is hard to unload
the services (incorrect unload leads to memory leak, resource leak or error (like port in use)),
and critical error makes the core module unstable (unhandled error and unhandled rejection leads to restart),
so these new apps are deployed on their own, communicating with core process by domain socket, sending
json as plain text, the socket connections are pooled to prevent frequent open and close

> this is also why this project is categoried from "website" to "reverse proxy"

and writing api declaration twice (or sometimes more times) in front end and back end is boring and error prone,
so there is code generation part to make front end calling back end looks like a function call (like *rpc*)

TODO although major file download and upload service in drive.example.com will use oss direct transfer,
but still need small file operation here, but that really need core module awareness?

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

the not implemented separate process architecture
old adk
websocket api
streaming response

## New Application Check List

1. certificate, skip if no subdomain
   1. check dns record for appname.example.com to CNAME to example.com
   2. check dns record for _acme-challenge.appname.example.com to CNAME to _acme-challenge.example.com
   3. request certificate, see certificate.md
   4. claim permission sudo chown -R fine:fine /etc/letsencrypt/live/appname.example.com
   5. claim permission sudo chown -R fine:fine /etc/letsencrypt/archive/appname.example.com
   6. add to webroot/config certificates config
2. source code
   1. new folder in small/appname
   2. copy package.json from existing app, npm i
   3. add folder structure for src/server, src/client, src/shared
   4. copy akari.ts from existing app, node script/make-akari.ts ../small/appname
   10. copy akari.json from existing app
   5. write database.xml
   6. write empty index.ts `// AUTOGEN` TODO auto section imports should be auto
   7. write api.xml
   11. TODO missing src/server/dispatch.d.ts
   8. write empty index.tsx `// AUTOGEN` TODO auto section imports should be auto
   9. write empty index.html or copy from existing app
3. static content and core module config
   1. create webroot/static/appname folder
   2. add to static content config
   3. add to web app config
4. run akari.ts
   1. add empty implementations in index.ts
   2. make akari.ts run
   3. run remote akari.ts, run akari.ts with remote
