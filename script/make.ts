import path from 'node:path';

// this script assembles build scripts (akari.ts in this repository and related repositories)
// TODO change the following comment to 'see build-script.md'

// - according to this repository's no-intermediate-file principle,
//   this script work by collecting components in the components directory,
//   type check them and do some dependency validation,
//   and directly insert into target file (the build scripts) dedicated sections,
//   kind of similar to code generation partial task
// - the build scripts are all typescript because nowadays nodejs support executing typescript
//   directly, this dramatically reduces the complexity of bootstrapping the script architecture
//   by completing removing the need to bootstrapping...
// - similar to current bundler implementation, this script also avoids function wrapper
//   when merging multiple modules by directly combining script contents, differences
//   - the module dependency structure here is simpler, and bundle result is eaiser for
//     human to read and validate
//   - all build scripts are typescript so this bundle does not happen after transpile,
//     and should include type information
// - different from original bootstrapping architecture, this build-build-script script is not
//   transpiled and built, in this case, I may try to type checking and eslint this script occassionally

// TODO don't forget that akari.ts manual part need to handle example.com

// TODO always include logger
// TODO it looks like akari.ts assembling configuration only need 
//      one line `components: arch, codegen, mypack, minify, sftp, typescript`
const components = [
    'arch',
    'codegen',
    'minify',
    'mypack',
    'sftp',
    'typescript',
];

const targetDirectory = process.argv[2];
const targetFile = path.join(targetDirectory, 'akari.ts');

// TODO try invoking typescript.transpile here to type checking with noemit option
