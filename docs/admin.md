# Admin

admin process invoves

1. start/stop/restart server, also include send warning is server auto restart too frequently
2. receives build script command and forward to server to hot reloading
3. receives build script command and forward to webpage for hot reloading
4. other server management commands

they are mainly implemented by 2 tools

- build script (admin features) running on local
- deamon process running on remote

## Server Hot Reloading

server-core is able to hot reload
- server component (app server, see docs/build-script#server_core_app_server_border) 
- static content (app client, see src/server-core/content.ts)

commands are available both in build script and deamon process cli
```shell
$ maka deploy ak-client
$ maka deploy wimm-server
$ maka deploy user-page
$ 
$ fpsd reload wimm-client
$ fpsd reload collect-server
$ fpsd reload home-page
```

## Webpage Hot Reloading

> currently this is simply refresh page when watch rebuild complete

when watching app-client, fpsd will accept websocket connection and forwards refresh command from build script to webpage, it is implemented as

1. add 'x/x.js' to asset list and insert into rendered html, the kind of magic is the intermediate slash,
   the script tag is formated as `src="/${filename}"`, normal asset name does not contain any slash character
2. `reload-app-client` handler will read html and match script tag to get content list, the ref part is `/\/[\w\-\.]+/` so this name is not matched
3. a `config-devmod` command requires content to return some `new WebSocket` code for `ctx.path == '/x/x.js'`
4. the script executed at front end connects with deamon process websocket server, which is started by build script not server core
5. rebuild complete sends `reload-app-client` and `refresh` to deamon process and frowards to server-core and webpage websocket and refresh the page

### Security Considerations

1. deamon process has `dev` mode and `pro` mode, they are controlled only in deamon process cli
    ```shell
    $ fpsd dev
    $ fpsd pro
    ```
   build script commands and webpage websocket server is only opened in dev mode, dev mode will be disabled if no dev command received in 2 hours
2. build scrript commands are sent through https connection, because these requests are not authenticated, 
   these command strings are encrypted with asymmtric algorithm, so that deamon process and build script do not need to exchange secret,
   public key can be publicly 'GET' from server
3. javascript files are not sent through http connection but only sftp connection, because it is dangerous to deploy exectuable files 
   through unauthenticated connection
4. log files are not downloaded through http connection but only sftp connection, because they may expose server important internal values

### Other

start/stop commands are only available in deamon process cli

```shell
$ fpsd start
$ fpsd stop
$ fpsd restart
```

other commands are only available in deamon process cli

```shell
$ fpsd enable-feature signup
$ fpsd disable-feature signup
$ fpsd disable-user 3
$ fpsd enable-user 3
$ fpsd expire-device 3
```
