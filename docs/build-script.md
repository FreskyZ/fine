# Build Script

build script entry is called `maka`, which is combination of `make` and 'admin', not mutation of MAGA!

```shell
$ maka server-core
$ maka watch server-core
$ maka home-page
$ maka watch home-page
$ maka cost-server
$ maka cost-client
$ maka watch cost-server
$ maka watch cost-client
$ maka watch cost
$
$ maka self
$ maka public
$ maka clean
$
$ maka shutdown
$ maka reload-static www
$ maka reload-static cost
$ maka reload-server collect
$ maka expire-token 1
```

## MyPack Bundler

This is the final replacement of webpack mechanism for node targets: webpack itself is replaced.

This bundler always read file from memory (which comes from typescript compiler hook which writes directly to memory and even don't write to disk),
recognizes all `require(".` and replace them with `__my_require__`, module id (module name) is relative path to entry, so the entry itself is always `'.'`,
and source map is simply merged together with `generatedLine += currentLine`

This bundler together with functions in build script actually implements `webpack + ts-loader`, with watch, source map and split chunk feature, 
and additional features like no-intermediate-file, no-tsconfig-file, no-webpack-config-file, etc., in about 1k lines of code and 4.9 bundled compressed size,
another reason that webpack is bad or webpack is too difficult to learn and understand


## Target Border

target means build script target, like server-core, app-server and app-client,
target border mainly considers what happened at server-core-app-server border and app-server-app-client border,
also, server-core-shared, app-server-shared border, app-client-shared border was issues

### `*-shared` border

1. for `shared/types/*.d.ts` declaration files, tsc will only use them to check type and will not emit anything
2. for `shared/*.ts` files, 
   1. tsc will emit entry files and shared files into `<targetdir>/server-core/index.js`
      or `<targetdir>/cost/server/index.js` and `<targetdir>/shared/*.js` to make them still in required target directory 
      while node require statement still work correctly
   2. mypack will pack them and name the modules like `../shared/*` or `../../shared/*`,
      they are designed to be small and packed together, pack them to different target is not considered waste
      while there is no issues like 'duplicate symbol' when linking native executable objects

### `server-core-app-server` border

1. this border theoretically should use typescript project reference feature, *BUT*, 
   1. this feature is not publically available in compiler api (or node api)
      (actually the whole compiler api is not very documented)
   2. investigate in source code is complex, also I currently did not find internal documents about this feature. 
   3. this feature will also add a ".tsBuildInfo" file in root directory, 
      which kind of do not meet my project's "no any config files" designment

2. so it actually uses a node dynamic import (actually `require` function is always dynamic), which works like
    ```js
    require(`..\${app}\server`).dispatch(ctx)
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
