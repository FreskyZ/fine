import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import tls from 'node:tls';
import chalk from 'chalk-template';
import SFTPClient from 'ssh2-sftp-client';
import { minify } from 'terser';
import ts from 'typescript';

const debug = 'AKARI_DEBUG' in process.env;
const config = JSON.parse(await fs.readFile('akaric', 'utf-8'));

// ???
const mycert = await fs.readFile('../../my.crt', 'utf-8');
const originalCreateSecureContext = tls.createSecureContext;
tls.createSecureContext = options => {
    const originalResult = originalCreateSecureContext(options);
    if (!options.ca) {
        originalResult.context.addCACert(mycert);
    }
    return originalResult;
};

// seems cannot reuse program object after file changed, so need to create new object every time
function createTypescriptProgram() {
    return ts.createProgram([path.resolve('src/core/index.ts')], {
        lib: ['lib.esnext.d.ts'],
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        skipLibCheck: true,
        noEmitOnError: true,
        // NOTE for strict
        // I spent some time to fix non strict warnings and a lot of tsc-is-not-clever-enough / their-document-says-this-ask-them exclamation marks
        // (one of the reasons is that my (FreskyZ@outlook.com) code is very strongly typed and well considered safe)
        // so I decided to continue this pattern, every some time use this environment variable to check for non strict warnings and possible errors, but most of the time this switch is not on
        strict: 'AKARIN_STRICT' in process.env,
        noImplicitAny: true,
        noFallthroughCaseInSwitch: true,
        noImplicitReturns: true,
        noImplicitThis: true,
        noUnusedLocals: true,
        noUnusedParameters: true,
        strictNullChecks: 'AKARIN_STRICT' in process.env,
        strictFunctionTypes: true,
        strictBindCallApply: true,
        strictBuiltinIteratorReturn: true,
        removeComments: true,
        outDir: '/vbuild',
    });
}

/**
 * @param {ts.Program} program
 */
function validateTopLevelNames(program) {
    console.log('collecting top level names');
    let hasError = false;
    const /** @type {Record<string, string[]>} */ result = {}; // module name (absolute path) => names
    const sourceFiles = program.getSourceFiles().filter(sf => !sf.fileName.includes('node_modules') && sf.fileName.startsWith(process.cwd()));
    for (const sourceFile of sourceFiles) {
        const names = [];
        ts.forEachChild(sourceFile, node => {
            if (ts.isVariableStatement(node)) {
                if (node.declarationList.declarations.length > 1) {
                    hasError = true;
                    console.error(chalk`{red error} not support multiple declarations in variable declaration, I will not do that, when will that happen?`);
                    return;
                }
                const declaration = node.declarationList.declarations[0];
                if (ts.isIdentifier(declaration.name)) {
                    names.push(declaration.name.text);
                } else if (ts.isObjectBindingPattern(declaration.name) || ts.isArrayBindingPattern(declaration.name)) {
                    // recursively extract names from nested binding patterns
                    const extractNames = (/** @type {ts.ObjectBindingPattern | ts.ArrayBindingPattern} */ bindingPattern) => {
                        for (const element of bindingPattern.elements) {
                            // array binding pattern only have an additional omitexpression in elements, which is not interested here, so a isBindingElement can handle both
                            // if you want to omit the if and use .filter, typescript currently still don't understand for element in elements.filter(ts.isBindingElement)
                            if (ts.isBindingElement(element)) {
                                if (ts.isIdentifier(element.name)) {
                                    names.push(element.name.text);
                                } else if (ts.isObjectBindingPattern(element.name) || ts.isArrayBindingPattern(element.name)) {
                                    extractNames(element.name);
                                }
                            }
                        }
                    };
                    extractNames(declaration.name);                
                }
            } else if (ts.isFunctionDeclaration(node)) {
                if (ts.isIdentifier(node.name)) {
                    names.push(node.name.text);
                }
            } else if (ts.isImportDeclaration(node)) {
                // NOTE collect import is not here, this include types, which is more inconvenient to exclude
            } else if (ts.isExportDeclaration(node)) {
                // this looks like dedicated export statement `export { a, b as c };`,
                // export const and export function is normal variable statement or function definition statement
                hasError = true;
                const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.pos);
                console.error(chalk`{red error} ${sourceFile.fileName}:${line + 1}:${character + 1}: not support dedicated export statement for now`); //, node);
            } else if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) {
                // not relavent to js
            } else if (ts.isClassDeclaration(node)) {
                if (ts.isIdentifier(node.name)) {
                    names.push(node.name.text);
                }
            } else if (ts.isExpressionStatement(node) || ts.isForOfStatement(node) || ts.isIfStatement(node)) {
                // top level expression and normal statements will not define new name
            } else if (node.kind == 1) {
                // this is the EOF token
            } else {
                hasError = true;
                const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.pos);
                console.error(chalk`{red error} ${sourceFile.fileName}:${line + 1}:${character + 1}: unknown top level node kind: ${ts.SyntaxKind[node.kind]}`); //, node);
            }
        });
        result[sourceFile.fileName] = names;
    }
    for (const [fileName, names] of Object.entries(result)) {
        for (const name of names) {
            const previousFileName = Object.entries(result).find(file => file[0] != fileName && file[1].includes(name))?.[0];
            if (previousFileName) {
                hasError = true;
                console.error(chalk`{red error} ${fileName} top level name ${name} has appeared in previous file ${previousFileName}`);
            }
        }
    }
    if (debug) {
        for (const [fileName, names] of Object.entries(result)) {
            console.log(`${fileName}: ${names.join(',')}`)
        }
    }
    return !hasError; // !hasError => ok
}

/**
 * @param {ts.Program} program
 * @returns {Record<string, string>} transpile result files
 */
function transpile(program) {
    console.log('transpiling');
    const /** @type {Record<string, string>} */ result = {};
    const emitResult = program.emit(undefined, (fileName, data) => {
        if (data) {
            result[fileName] = data;
        }
    });
    const transpileErrors = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics).map(diagnostic => {
        if (diagnostic.file) {
            const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
            const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
            return chalk`{red error} ${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`;
        } else {
            return chalk`{red error} ` + ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
        }
    });
    for (const message of transpileErrors.filter((v, i, a) => a.indexOf(v) == i)) {
        console.log(message);
    }
    return transpileErrors.length ? null : result;
}

// syntax:
// import a from 'module'; // default import
// import { b, c, d } from 'module'; // named import
// import * as e from 'module'; // namespace import
// import f, { g, h } from 'module'; // default import + named import
// import i, * as j from 'module'; // default import + namespace import
// // import i, * as j, { k, l, m } from 'module'; // cannot use namespace import and named import at the same time
// import {} from 'module'; // throw error on this as an lint error
// import 'module'; // will this be used?
/**
 * @typedef {Object} ImportDeclaration same name as ts.ImportDeclaration
 * @property {string} moduleName the original string part in original content
 * @property {string} defaultName default import name, the `a` in `import a from 'module'`
 * @property {string} namespaceName namespace import name, the `a` in `import * as a from 'module'`
 * @property {[string, string][]} names named import name, the `b`, `c`, `d` in `import { b, c, d as e } from 'module'`, saved as ['b', 'b'] for normal, saved as ['d', 'e'] for alias
 * @property {PackingModule} relative the module instance for relative import, this is assigned later after analyze all imports
 */
/**
 * @typedef {Object} PackingModule module is a too generic name
 * @property {string} path absolute path
 * @property {string} content full original content
 * @property {ImportDeclaration[]} imports import declarations
 */
/**
 * @param {Record<string, string>} transpileResult
 * @returns {PackingModule[]} array of module path, content and module dependencies
 */
function resolveModuleDependencies(transpileResult) {
    console.log('resolve module dependencies');
    let hasError = false;
    const /** @type {PackingModule} */ modules = [];
    for (const [fileName, fileContent] of Object.entries(transpileResult)) {
        const /** @type {PackingModule} */ module = { path: fileName, content: fileContent, imports: [] };
        fileContent.split('\n').map((r, i) => [r, i + 1]).filter(line => line[0].trimStart().startsWith('import ')).forEach((/** @type {[string, number]} */ [line, rowNumber]) => {
            const raw = line;
            const /** @type {ImportDeclaration} */ declaration = { names: [] };
            // use plain string operation because regex does not fully handle this

            line = line.substring(7).trimStart(); // move over 'import '
            let match = /^(?<name>\w+\s)/.exec(line);
            if (match) {
                declaration.defaultName = match.groups.name.trim();
                line = line.substring(declaration.defaultName.length + 1).trimStart(); // move over default name
            }
            if (line.startsWith(',')) {
                // move over comma if have, it's ok to not handle trailing comma because tsc will syntax check that
                line = line.substring(1).trimStart();
            }

            if (line.startsWith('*')) {
                line = line.substring(1).trimStart();
                if (!line.startsWith('as')) {
                    hasError = true;
                    console.error(chalk`{red error} ${fileName}:${rowNumber}: ${raw}: invalid syntax, when will this happen? (1)`);
                    return;
                }
                line = line.substring(2).trimStart();
                match = /^(?<name>\w+\s)/.exec(line);
                if (!match) {
                    hasError = true;
                    console.error(chalk`{red error} ${fileName}:${rowNumber}: ${raw}: invalid syntax, when will this happen? (2)`);
                    return;
                }
                declaration.namespaceName = match.groups.name.trim();
                line = line.substring(declaration.namespaceName.length + 1).trimStart(); // move over namespace name
            }
            if (line.startsWith('{')) {
                line = line.substring(1).trimStart(); // move over left brace
                while (true) {
                    match = /^(?<name>\w+)\s?(\s*as\s+(?<alias>\w+))?/.exec(line);
                    if (!match) {
                        break; // this is end of name list, not error
                    }
                    if (match.groups.alias) {
                        hasError = true;
                        console.error(chalk`{red error} ${fileName}:${rowNumber}: ${raw}: not support import name alias for now`);
                        return;
                    }
                    declaration.names.push([match.groups.name, match.groups.alias ?? match.groups.name]);
                    line = line.substring(match[0].length).trimStart();
                    if (line.startsWith(',')) {
                        line = line.substring(1).trimStart(); // move over comma
                    }
                }
                if (!line.startsWith('}')) {
                    hasError = true;
                    console.error(chalk`{red error} ${fileName}:${rowNumber}: ${raw}: invalid syntax, when will this happen? (4)`);
                    return;
                }
                line = line.substring(1).trimStart(); // move over right brace
            }
            if (!line.startsWith('from ')) {
                hasError = true;
                console.error(chalk`{red error} ${fileName}:${rowNumber}: ${raw}: invalid syntax, when will this happen? (5)`);
                return;
            }
            line = line.substring(5).trimStart(); // move over from

            match = /^['"](?<name>.+)['"]/.exec(line);
            if (!match) {
                hasError = true;
                console.error(chalk`{red error} ${fileName}:${rowNumber}: ${raw}: invalid syntax, when will this happen? (6)`);
                return;
            }
            declaration.moduleName = match.groups.name;
            module.imports.push(declaration);
        });
        modules.push(module);
    }
    if (debug) {
        for (const module of modules) {
            console.log(`${module.path}: `);
            for (const declaration of module.imports) {
                console.log(`   from: ${declaration.moduleName}, default: ${declaration.defaultName
                    || ''}, namespace: ${declaration.namespaceName || ''}, names: ${declaration.names.join(',')}`);
            }
        }
    }
    return hasError ? null : modules;
}

/**
 * check non relative reference consistency and merge
 * if namespace import and named import are used at the same time, they use one entry, but will generate 2 import statements in result
 * @param {PackingModule[]} modules
 * @returns {ImportDeclaration[]} all external references
 */
function validateExternalReferences(modules) {
    console.log('checking external references');
    let hasError = false;
    
    const /** @type {ImportDeclaration[]} */ result = [];
    for (const module of modules) {
        for (const declaration of module.imports.filter(d => !d.moduleName.startsWith('.'))) {
            const resultDeclaration = result.find(m => m.moduleName == declaration.moduleName);
            if (!resultDeclaration) {
                // deep clone, modify original object seems no error for now, but don't do that
                result.push({ ...declaration, names: [...declaration.names] });
            } else {
                if (declaration.defaultName) {
                    if (resultDeclaration.defaultName && resultDeclaration.defaultName != declaration.defaultName) {
                        hasError = true;
                        console.error(chalk`{red error} ${module.path}: inconsistent default import from '${declaration.moduleName}', previous use ${resultDeclaration.defaultName}, here use ${declaration.defaultName}`);
                    } else if (result.some(er =>
                        er.moduleName != declaration.moduleName
                        && (er.defaultName == declaration.defaultName
                        || er.namespaceName == declaration.defaultName
                        || er.names.some(n => n[1] == declaration.defaultName))
                    )) {
                        hasError = true;
                        console.error(chalk`{red error} ${module.path}: default import ${declaration.defaultName} from '${declaration.moduleName}' has appeared in other import declarations from other modules`);
                    } else if (resultDeclaration.names.some(n => n[1] == declaration.defaultName)) {
                        hasError = true;
                        console.error(chalk`{red error} ${module.path}: default import ${declaration.defaultName} from '${declaration.moduleName}' has appeared previous named imports from this module, when will this happen?`);
                    } else if (!declaration.defaultName) {
                        resultDeclaration.defaultName = declaration.defaultName;
                    }
                }
                if (declaration.namespaceName) {
                    if (resultDeclaration.namespaceName && resultDeclaration.namespaceName != declaration.namespaceName) {
                        hasError = true;
                        console.error(chalk`{red error} ${module.path}: inconsistent namespace import from '${declaration.moduleName}', previous use ${resultDeclaration.namespaceName}, here use ${declaration.namespaceName}`);
                    } else if (result.some(er =>
                        er.moduleName != declaration.moduleName
                        && (er.defaultName == declaration.namespaceName
                        || er.namespaceName == declaration.namespaceName
                        || er.names.some(n => n[1] == declaration.namespaceName))
                    )) {
                        hasError = true;
                        console.error(chalk`{red error} ${module.path}: namespace import ${declaration.namespaceName} from '${declaration.moduleName}' has appeared in other import declarations from other modules`);
                    } else if (resultDeclaration.names.some(n => n[1] == declaration.namespaceName)) {
                        hasError = true;
                        console.error(chalk`{red error} ${module.path}: namespace import ${declaration.namespaceName} from '${declaration.moduleName}' has appeared previous named imports from this module, when will this happen?`);
                    } else if (!declaration.namespaceName) {
                        resultDeclaration.defaultName = declaration.defaultName;
                    }
                }
                for (const namedName of declaration.names) {
                    if (result.some(er =>
                        er.moduleName != declaration.moduleName
                        && (er.defaultName == namedName
                        || er.namespaceName == namedName
                        || er.names.some(n => n[1] == namedName))
                    )) {
                        hasError = true;
                        console.error(chalk`{red error} ${module.path}: import ${namedName} from '${declaration.moduleName}' has appeared in other import declarations from other modules`);
                    }
                }
                // merge, dedup and sort
                resultDeclaration.names = resultDeclaration.names.concat(declaration.names)
                    // NOTE name alias need 2 identifiers be same, note that you are allowed to import same name into different names
                    .filter((v, i, a) => a.findIndex(e => e[0] == v[0] && e[1] == v[1]) == i)
                    // sort by result name, not the original name
                    .sort((a, b) => b[1].localeCompare(a[1]));
            }
        }
    }
        
    // sort by module name, first by starts with 'node:' first, then by name
    result.sort((lhs, rhs) => {
        const leftIsNode = lhs.moduleName.startsWith('node:');
        const rightIsNode = rhs.moduleName.startsWith('node:');
        if (leftIsNode && !rightIsNode) return -1;
        if (!leftIsNode && rightIsNode) return 1;
        // this correctly handles rest part after node: and non node module names
        return lhs.moduleName.localeCompare(rhs.moduleName);
    });
    if (debug) {
        console.log('final external references: ');
        for (const declaration of result) {
            console.log(`   from: ${declaration.moduleName}, default: ${declaration.defaultName
                || ''}, namespace: ${declaration.namespaceName || ''}, names: ${declaration.names.join(',')}`);
        }
    }
    return hasError ? null : result;
}

/**
 * @param {PackingModule[]} modules
 * @returns {PackingModule[]} sorted modules after validation
 */
function validateRelativeImports(modules) {
    console.log('checking relative imports');
    let hasError = false;
    // https://nodejs.org/api/esm.html#resolution-algorithm
    for (const module of modules) {
        for (const declaration of module.imports.filter(d => d.moduleName.startsWith('.'))) {
            const resolvedModuleName = [
                path.resolve(path.dirname(module.path), declaration.moduleName),
                path.resolve(path.dirname(module.path), declaration.moduleName, './index.js'),
            ].find(p => modules.some(m => m.path == p));
            if (!resolvedModuleName) {
                hasError = true;
                console.error(chalk`{red error} ${module.path}: import '${declaration.moduleName}' not found, when will this happen?`);
                continue;
            }
            declaration.relative = modules.find(m => m.path == resolvedModuleName);
        }
    }
    const /** @type {PackingModule[]} */ sortedModules = [];
    // clone another dependency mapping, don't modify original data
    let /** @type {[PackingModule, PackingModule][]} */ relationships = modules.reduce((acc, m) => acc.concat(m.imports.filter(d => d.relative).map(d => [d.relative, m])), []);
    let remainingModules = [...modules];
    let depth = 0;
    while (true) {
        // not imported by other module
        const noDependencyModules = remainingModules.filter(m => !relationships.some(r => r[1] === m));
        sortedModules.push(...noDependencyModules);
        relationships = relationships.filter(r => !noDependencyModules.includes(r[0]));
        remainingModules = remainingModules.filter(m => !noDependencyModules.includes(m));
        if (remainingModules.length == 0) {
            break;
        }
        depth += 1;
        if (depth >= 10) {
            hasError = true;
            console.error(chalk`{red error} too deep dependency or recursive dependency`);
            break;
        }
    }
    // entry must be in last batch of modules, but may not be last module, you need to explicitly do that
    const finalSortedModules = sortedModules.filter(m => m.path != '/vbuild/core/index.js').concat(sortedModules.find(m => m.path == '/vbuild/core/index.js'));
    if (debug) {
        console.log(`sorted modules:\n${finalSortedModules.map(m => m.path).join('\n')}`);
    }
    return hasError ? null : finalSortedModules;
}

/**
 * pack and monify
 * @param {PackingModule[]} modules
 * @param {ImportDeclaration[]} externalReferences
 * @returns {Promise<string>} pack then minify result
 */
async function pack(sortedModules, externalReferences) {
    console.log(`combining into single file`);
    let resultJs = '';
    for (const declaration of externalReferences) {
        resultJs += 'import ';
        if (declaration.defaultName) {
            resultJs += `${declaration.defaultName}, `;
        }
        if (declaration.namespaceName) {
            resultJs += `* as ${declaration.namespaceName}, `;
        }
        if (declaration.names.length) {
            resultJs += `{ `;
            for (const [name, alias] of declaration.names) {
                if (name == alias) {
                    resultJs += `${name}, `;
                } else {
                    resultJs += `${name} as ${alias}, `;
                }
            }
            resultJs = resultJs.slice(0, -2) + ' }, ';
        }
        resultJs = resultJs.slice(0, -2) + ` from \'${declaration.moduleName}\'\n`;
    }
    for (const module of sortedModules) {
        resultJs += '\n';
        resultJs += `// ${module.path}\n`;
        for (const line of module.content.split('\n').filter(r => !r.trim().startsWith('import'))) {
            // no need to export symbol, or else terser will keep the name
            const noexport = line.startsWith('export ') ? line.substring(7) : line;
            const substitution = noexport.replaceAll('example.com', config['main-domain']);
            resultJs += substitution + '\n';
        }
    }
    console.log(`minify`);
    try {
        const minifyResult = await minify(resultJs, {
            module: true,
            compress: { ecma: 2022 },
            format: { max_line_len: 160 },
        });
        return minifyResult.code;
    } catch (err) {
        console.error(chalk`{red error} terser`, err, resultJs);
        return null;
    }
}

async function reportLocalBuildComplete(ok) {
    const response = await fetch(`https://${config['main-domain']}:8001/local-build-complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok }),
    });
    if (response.ok) {
        console.log('POST /local-build-complete ok');
    } else {
        console.log('POST /local-build-complete not ok', response);
    }
}

async function buildAndDeploy() {

    const program = createTypescriptProgram();
    const validateResult = validateTopLevelNames(program);
    if (!validateResult) { console.log('there are error in collecting top level names'); return await reportLocalBuildComplete(false); }
    const transpileResult = transpile(program);
    if (!transpileResult) { console.log('there are error in transpiling'); return await reportLocalBuildComplete(false); }
    const modules = resolveModuleDependencies(transpileResult);
    if (!modules) { console.log('there are error in resolving module dependencies'); return await reportLocalBuildComplete(false); }
    const sortedModules = validateRelativeImports(modules);
    if (!sortedModules) { console.log('there are error in checking relative imports'); return await reportLocalBuildComplete(false); }
    const externalReferences = validateExternalReferences(modules);
    if (!externalReferences) { console.log('there are error in checking external references'); return await reportLocalBuildComplete(false); }
    const resultJs = await pack(sortedModules, externalReferences);
    if (!resultJs) { console.log('there are error in minify'); return await reportLocalBuildComplete(false); }
    console.log(`complete build`);

    console.log(`uploading`);
    // the ssh connection periodically lose connection after some time of no activity
    const sftpclient = new SFTPClient();
    await sftpclient.connect({
        host: config['main-domain'],
        username: config.ssh.user,
        privateKey: await fs.readFile(config.ssh.identity),
        passphrase: config.ssh.passphrase,
    });
    await sftpclient.put(Buffer.from(resultJs), path.join(config.webroot, 'index.js'));
    console.log(`complete upload`);

    await reportLocalBuildComplete(true);
}

const readlineInterface = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});
function connectRemoteCommandCenter() {
    const websocket = new WebSocket(`wss://${config['main-domain']}:8001/for-build`);
    websocket.addEventListener('close', async () => {
        console.log(`websocket: disconnected`);
        await readlineInterface.question('input anything to reconnect: ');
        connectRemoteCommandCenter();
    });
    websocket.addEventListener('error', async error => {
        console.log(`websocket: error:`, error);
        await readlineInterface.question('input anything to reconnect: ');
        connectRemoteCommandCenter();
    });
    websocket.addEventListener('open', async () => {
        console.log(`websocket: connected, you'd better complete authentication quickly`);
        const token = await readlineInterface.question('> ');
        websocket.send(token);
        console.log('listening to remote request');
    });
    websocket.addEventListener('message', event => {
        console.log('websocket: received data', event.data);
        buildAndDeploy();
    });
}
connectRemoteCommandCenter();
