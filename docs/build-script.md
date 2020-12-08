# Build Script

build script entry is called `maka`, which is combination of `make` and 'admin', not mutation of MAGA!

```shell
$ maka self
$ maka server-core
$ maka watch server-core
$ maka home-page
$ maka watch home-page
$ maka cost-server
$ maka cost-client
$ maka shutdown
$ maka content-update www index.html
$ maka content-update collect index.js
```

## API Declaration

this topic seems to be some server-core or app server internal feature (like how is server content served),
but it is actually related to build script because api function is the border of both server-core-app-server and app-server-app-client

### `server-core` - `app-server` border

1. write import 






TODO how to separate build server core and app servers
TODO update this

// NOTE for "chunk-split-like" feature
// server-core, shared and apps and designed to be separately built and hot reloaded
// 1. shared types are simple because they are not considered in output (or emit stage)
// 2. shared logics for server codes are kind of simple
//    1. for server-core, set transpile output to 'build' instead of 'build/server-core' is enough, 
//       server-core result is in 'build/server-core' and 'shared' result in 'build/shared',
//       webpack will continue to work because it merges all files, shared is designed to be merged
//    2. for app server and client, except set output directory to 'build', 
//       a redirect from 'build/app' to 'build/app-server' or 'build/app-client' is needed in write file hook
// 3. app-server is complex, it theoretically should use typescript project reference feature, *BUT*, 
//    1. this feature is not publically available in compiler api (or node api)
//       (actually the whole compiler api is not very public)
//    2. investigate in source code is complex, also I currently did not find internal documents about this feature. 
//    3. this feature will also add a ".tsBuildInfo" file in root directory, 
//       which kind of do not meet my project's "no webpack config and tsconfig" requirement
// 4. so, in consider of app-server's export is very simple (export { controller: express.Router })
//    it is implemented by
//    1. hook read file and change import statement in api.ts to same directory 'import { controller } from './app'
//    2. hook read file and return dummy empty implementation for the dummy file
//    3. hook write file and change back the dummy import statement
//    4. externalize app-server in webpack config

TODO how to use the advantange of shared code between app front end and back end
investigate use build script to generate front end wrap code (call fetch) and backend wrap code (from request handler to implement functions), then missing functions, incorrect signatures. etc. will generate typescript transpile error