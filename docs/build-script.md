# Build Script

build script builds, deploys and maintenances the whole project

2 executable files,
- one running on develop environment, which
  - transpile sass and merge css
  - transpile typescript and pack javascript
  - other build process like code generation and lint
  - render html template
  - deploy build result
  - provide cli to forward other admin commands
- one running on server deploy environment, which
  - restarts server after server-core deploy
  - hot reload server component or statiic file after deploy
  - receives other admin command and forward to server-core

in additional
- all build script is in `script` directory except the ones that must be in server-core
- build script is written in typescript and it is build by itself, to prevent bootstrap issues, the executable file is tracked by version control
- the 2 executable files are all called `akari`, who is akarin?
- build script is invoked directly, that is *8* letters less then `npm run akari target` and *5* letters less than `node akari target`

## CLI Reference

akari local

```shell
$ akari self
$ akari public
$ akari server-core
$ akari watch server-core
$ akari home-page
$ akari watch home-page
$ akari cost-server
$ akari cost-client
$ akari watch cost-server
$ akari watch cost-client
$ akari watch cost-both
$
$ akari all
```

akari server does not have command line interface but is started by systemctl because the ssh session will be long no action when developing, let systemctl start it and leave it running is more proper

## No Build Config File

normally you will have many config files for mono repo, like series of `tsconfig.json`, `webpack.config.js`, `.babelrc` and `eslintrc`, maintaining them is hard work and harder when the project file structure frequently changes in early development phase

this build script, instead of normal method, uses all tools' node api for their functionalities, 
> nearly all modern front end tools have node api, because most of them will want to be integrited with webpack which requires adapting their node api with webpack's plugin/loader api, while many tools have standalone (comparing to use in webpack) command line interface, a well-designed internal structure will separate a node api to be shared between cli and webpack api, on the other hand, webpack have very powerful (or complicate) node api, as webpack itself is very complex

in detail,
- typescript use compiler api, not `ts-loader` or `awesome-typescript-loader`, because both of them do not support no-config-file usage, while compiler api supports
- sass use it's own node api instead of `sass-loader!css-loader!style-loader` (the exclamation mark is how these series of loaders display in webpack statistics), because I'd like to compare this usage to commonly used 'bundle-css-in-js' pattern
- backend is not using webpack, because webpack causes serious performance issue on my poor deployment server, describe later
- web pages are not using webpack, because they only have one ts file and it is tranpiled into javascript and served
- front end webpack configuration is inlined in build script source code
- eslint node api supports no-config-file usage, actually its command line interface also supports it

> vscode eslint is disabled because it is annoying in many cases, while vscode have many unexpected or not-designed behavior facing mono repo, especially this mono repo without tsconfig, like its hinting browser javascript global variables in back end code, or complains unknown variable which is implemented by typescript custom transformer in build script

## MyPack Bundler

it is added because serious performance issues occurs when watching on my poor performance server deploy machine, it starts from a very simply text joiner, to a not very simply text joiner with source map, minify, etc. features

this bundler read file from memory, recognizes all `require(".` and replace them with `myimport`, module id (module name) is relative path to entry, then join them and generate source map by the way, finally minified if configured, this is actually the core functionality of a bundler

## Target Border

target means build script target, like server-core, app-server and app-client, target border mainly considers what happened at server-core-app-server border and app-server-app-client border, also, server-core-shared, app-server-shared border, app-client-shared border was issues

### `*-shared` border

1. for `shared/types/*.d.ts` declaration files, tsc will only use them to check type and will not emit anything
2. for `shared/*.ts` files, 
   1. tsc will emit entry files and shared files into `<targetdir>/server-core/index.js`
      or `<targetdir>/cost/server/index.js` and `<targetdir>/shared/*.js` to make them still in required target directory 
      while node require statement still work correctly
   2. mypack will pack them and name the modules like `../shared/*` or `../../shared/*`,
      they are designed to be small and packed together, pack them to different target is not considered waste
      while there is no issues like 'duplicate symbol' when linking native executable objects
   3. except that their type definition, or class definition, or function definition is not same reference, so instanceof check will failed to be expected behavior

### `server-core-app-server` border

1. this border theoretically should use typescript project reference feature, *BUT*, 
   1. this feature is not publically available in compiler api (or node api)
      (actually the whole compiler api is not very documented)
   2. investigate in source code is complex, also I currently did not find internal documents about this feature. 
   3. this feature will also add a ".tsBuildInfo" file in root directory, 
      which kind of do not meet my project's "no any config files" designment

2. so it actually uses a node dynamic import (actually `require` function is always dynamic), which works like
    ```js
    require(`../${app}/server`).dispatch(ctx)
    ```
    1. for tsc, it only processes es6 `import` statement, it recognize `require` as a known function (in `lib.node.d.ts`) and pass by
    2. for mypack, I only recognize `require(".` while this expression requires a string template, so it pass by
    3. at runtime, node will try to load the module if it is not loaded and load from cache if previous loaded,
       simply delete the cache will make node load the module again next time, while invalidate cache is very easy after admin mechanism: 
    ```js
    admin.on('reload-server', app => { delete require.cache[require.resolve(...app...)]; })
    ```

3. for the boring dispatch method+path to handler part, 
   1. api.xml
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
   2. then a `dipatch(ctx: Ctx<MyState>): Promise<void>` is generated to dispatch method+path, see any app server/index.ts,
      tsc will raise error if any function is missing, parameter count is incorrect, parameter type is incorrect or return type is incorrect (void or not void)

### `app-server-app-client` border

1. this border actually is THE `server-core`, but here it means enable client code to call something like `api.getValue` which
   have same signature as app server's `getValue` function except server side have additional `ctx` parameter to hold some context values
2. this is also implemented by code generation and calling helper wrapper over `fetch` with authentication token (see auth.md), 
   after 2 side code generation and type sharing (any app/api.d.ts), they have same experience as calling function in one executable file

## Admin Server

akari (server) self is actually a http server and a websocket server, receiving and forwarding messages

- it is not integrited in server-core because it is strange to stop self, start server-core normal functions and start self when watching server-core
- although sometimes web browser is on develop machine and seems akari (local) can directly send message to browser to refresh it, but control browser is not that simple, and sometimes I need to test on mobile phone (some apps are designed to mainly use on mobile device), than akari (local) and web browser still need a well known server to contact

## Hot Reloading

- for server component, or build result of app-server target, see server-core-app-server-border section
- for static content, or build result of app-client/web-page targets, see src/server-core/content.ts
- for opened browser tab, or running instance of build result of app-client target, describe later

akari (local) will directly deploy to server from build results in memory and then sends reload command to akari (server) then server-core, they are part of build/watch cli and do not have their own cli

### Opened Tab Hot Reloading

webpack-dev-server is able to refresh page when js changes and reload css when css change, it is actually not complex

1. a `client-dev.js` is served from akari (server), containing dev mode code, it's script tag src attribute is `src="https://domain.com:port/client-dev.js" so it will not be recognized by static content reloading mechanism, this tag is added by 'watch app-client' target
2. the code will connect to the websocket server and reads reload command from akari (server) forwarded from akari (local), one of
   - `reload-js` refresh the complete page
   - `reload-css` which removes the css link element and adds back again, the css file is marked 'must-validate' cache control and will be reload by browser

## Other Commands

about authenticate, to be implemented

```shell
$ akari enable-signup
$ akari disable-signup
$ akari disable-user 3
$ akari enable-user 3
$ akari expire-device 3
```

about systemd service

```shell
$ akari service start
$ akari service status
$ akari service stop
$ akari service restart
$ akari service is-active
```

## My JSX Runtime

react 17.0.1 introduces new jsx factory https://reactjs.org/blog/2020/09/22/introducing-the-new-jsx-transform.html,
which is great readability improvement for `web-page` targets where no bundler is involved and browser and devtools gets typescript transpile result

it generates import from 'react/jsx-runtime' module instead of original React.createElement, 
but this module seems not available on unpkg.com which I'm using,
while the production version is very small and simple (slightly pretty printed):

```js
// node_modules/react/cjs/react-jsx-runtime.production.min.js
var f=require("react"),
   g=60103;
exports.Fragment=60107;
if("function"===typeof Symbol&&Symbol.for){ // my environment must have Symbol.for, so omitted
   var h=Symbol.for;
   g=h("react.element");
   exports.Fragment=h("react.fragment")
}
var m=f.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentOwner,
   n=Object.prototype.hasOwnProperty, // I assume typescript always generates plain props parameter and I'm not using spread props feature, so omitted
   p={
      key: !0,
      ref: !0,
      __self:!0,
      __source:!0
   }; // I'm using ['key', 'ref', ...].includes because that's simple and I do not expect performance loss because web-pages are always small
function q(c,a,k){
   var b,
      d={},
      e=null,
      l=null;
   void 0!==k&&(e=""+k);
   void 0!==a.key&&(e=""+a.key);
   void 0!==a.ref&&(l=a.ref);
   for(b in a)n.call(a,b)&&!p.hasOwnProperty(b)&&(d[b]=a[b]);
   if(c&&c.defaultProps)for(b in a=c.defaultProps,a)void 0===d[b]&&(d[b]=a[b]); // I'm not using any defaultProps
   return{$$typeof:g,type:c,key:e,ref:l,props:d,_owner:m.current}
}
exports.jsx=q;
exports.jsxs=q;
```

so my jsx runtime looks like

```js
    function myjsx(type,rawprops,maybekey){
        const props={};
        for(const n in rawprops){
            if(!['key','ref','__self','__source'].includes(n)){
                props[n]=rawprops[n]
            }
        }
        return{
            $$typeof:Symbol.for('react.element'),
            type,
            key:rawprops.key!==void 0?''+rawprops.key:maybekey!==void 0?''+maybekey:null,
            ref:rawprops.ref!== void 0?rawprops.ref:null,
            props,
            _owner:React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentOwner.current // then fire me
        }
    }
    function myjsxf(p,k){
       return myjsx(Symbol.for('react.fragment'),p,k);
    }
```
insert previous code without newline, then replace `_jsx(_Fragment)` and `_jsxs(_Fragment` as `myjsxf` and `_jsxs` and `_jsx` as `myjsx`

this is directly put at generated js file header, because web-page does not have multiple file

## Security Considerations

1. akari (server) can only start by hand and auto shutdown after 3 hours of inactivity (3 hour is, I think, the longest time I will spend thinking or write raw code while developing)
2. client my code source map (include source content) is served only when akari (server) is on, vendor source map is not generated or served because of performance not security
3. it does not use api (app-server)'s authentication machenism but require commands to be encrypted, the symmetric encryption key is generated when akari (server) starts and store in a file and download through ssh by akari (local)
4. javascript files are not sent through http connection but only sftp connection, because it is dangerous to deploy exectuable files through unauthenticated connection
5. log files are not downloaded through http connection but only sftp connection, because they may expose server important internal values
