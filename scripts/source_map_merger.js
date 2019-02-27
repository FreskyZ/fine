// see github.com/keik/merge-source-map
//
// read from mfs's all .js.map file, read from normal fs's server.js.map, merge, write server.js.map
// check process's uncaught exception mapping
//
// solve the problem that smc.originalPositionFor({ line, column: 0 }) not working
// smc.originalPositionFor({ line, column: 4 }) may working

