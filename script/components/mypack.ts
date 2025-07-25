import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { zstdCompressSync } from 'node:zlib';
import chalk from 'chalk-template';
import ts from 'typescript';
import { logInfo, logError } from './common.ts';
import { tryminify } from './minify.ts';
import type { TypeScriptContext } from './typescript.ts';

export interface MyPackContext {
    program?: ts.Program,
    // transpile result,
    // file name here normally starts with /vbuild,
    // and should be kind of short and easy to read so no more module name concept
    files?: Record<string, string>,
    // entry path as a key in mcx.files
    entry: string,
    // change external references to cdn, this is also module resolution so is here
    cdnfy?: boolean,
    // if logheader does not starts with 'mypack', it is prepended
    logheader?: string,
    // the major module list to work on
    modules?: MyPackModule[],
    // all external references
    externalRequests?: MyPackModuleRequest[],
    // pack result
    success?: boolean,
    resultJs?: string,
    // assign result hash in input mcx to compare last result
    resultHash?: string,
    resultModules?: { path: string, hash: string }[],
}

interface MyPackModule {
    path: string, // this comes from transpile result, which should start with /vbuild
    content: string, // full original content
    requests: MyPackModuleRequest[],
}

// syntax:
//    import a from 'module'; // default import
//    import { b, c, d } from 'module'; // named import
//    import * as e from 'module'; // namespace import
//    import f, { g, h } from 'module'; // default import + named import
//    import i, * as j from 'module'; // default import + namespace import
//    // import i, * as j, { k, l, m } from 'module'; // not allow namespace import and named import at the same time
//    import {} from 'module'; // throw error on this as an lint error
//    import 'module'; // side effect import, will this be used?
// naming:
//    modulerequest comes from old implementation,
//    it is a little shorter than importdeclaration,
//    although it fits more with original 'require' syntax, it is still an ok name
interface MyPackModuleRequest {
    moduleName: string, // the original specifier part in original content
    defaultName?: string, // default import name, the `a` in `import a from 'module'`
    namespaceName?: string, // the `a` in `import * as a from 'module'`
    // // named import names, name is original name, alias is same as name for normal named import
    // // e.g. `import { b, c, d as e } from 'module'` result in [{name:b,alias: b},{name:c,alias:c},{name:d,alias:e}]
    namedNames?: { name: string, alias: string }[],
    cdn?: string, // cdn url for external references if options.cdnfy
    relativeModule?: MyPackModule, // resolved relative import
}

// validate no duplicate top level names, return false for not ok
// NOTE this reads mcx.program
function validateTopLevelNames(mcx: MyPackContext): boolean {
    let hasError = false;
    const allNames: Record<string, string[]> = {}; // module name (absolute path) => names
    const sourceFiles = mcx.program.getSourceFiles().filter(sf => !sf.fileName.includes('node_modules'));
    for (const sourceFile of sourceFiles) {
        const names: string[] = [];
        ts.forEachChild(sourceFile, node => {
            if (ts.isVariableStatement(node)) {
                if (node.declarationList.declarations.length > 1) {
                    hasError = true;
                    const { line, character } = ts.getLineAndCharacterOfPosition(sourceFile, node.pos);
                    const position = `${sourceFile.fileName}:${line + 1}${character + 1}`;
                    logError(mcx.logheader, `${position} not support multiple declarations in variable declaration, I will not do that, when will that happen?`);
                    return;
                }
                const declaration = node.declarationList.declarations[0];
                if (ts.isIdentifier(declaration.name)) {
                    names.push(declaration.name.text);
                } else if (ts.isObjectBindingPattern(declaration.name) || ts.isArrayBindingPattern(declaration.name)) {
                    // recursively extract names from nested binding patterns
                    const extractNames = (bindingPattern: ts.ObjectBindingPattern | ts.ArrayBindingPattern) => {
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
                logError(mcx.logheader, `${sourceFile.fileName}:${line + 1}:${character + 1}: not support dedicated export statement for now`); // , node);
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
                logError(mcx.logheader, `${sourceFile.fileName}:${line + 1}:${character + 1}: unknown top level node kind: ${ts.SyntaxKind[node.kind]}`); // , node);
            }
        });
        allNames[sourceFile.fileName] = names;
    }
    for (const [fileName, names] of Object.entries(allNames)) {
        for (const name of names) {
            const previousFileName = Object.entries(allNames).find(file => file[0] != fileName && file[1].includes(name))?.[0];
            if (previousFileName) {
                hasError = true;
                logError(mcx.logheader, `${fileName} top level name ${name} has appeared in previous file ${previousFileName}`);
            }
        }
    }

    // for (const [fileName, names] of Object.entries(result)) {
    //     console.log(`${fileName}: ${names.join(',')}`)
    // }
    return !hasError;
}

// collect modules by resolve import declarations, return false for not ok
// NOTE this reads mcx.files, creates mcx.modules
// NOTE current implementation does not allow multiline import declarations,
// NOTE in current implementation, if multiple requests from same module in same module,
//      it results in multiple module.requests records, but later the merge correctly merge that
function resolveModuleDependencies(mcx: MyPackContext): boolean {
    let hasError = false;

    mcx.modules = [];
    for (const [fileName, fileContent] of Object.entries(mcx.files)) {
        const module: MyPackModule = { path: fileName, content: fileContent, requests: [] };

        fileContent.split('\n').map((r, i) => [r, i + 1] as const).forEach(([line, rowNumber]) => {
            const raw = line.trim();
            if (!raw.startsWith('import ')) { return; }
            const request = { namedNames: [] } as MyPackModuleRequest;

            // use plain string operation because regex does not fully handle this
            line = line.substring(7).trimStart(); // consume 'import '
            let match = /^(?<name>\w+\s)/.exec(line);
            if (match) {
                request.defaultName = match.groups['name'].trim();
                line = line.substring(request.defaultName.length + 1).trimStart(); // consume default name
            }
            // consume comma if exist, it's ok to not handle trailing comma because tsc will syntax check that
            if (line.startsWith(',')) { line = line.substring(1).trimStart(); }

            if (line.startsWith('*')) {
                line = line.substring(1).trimStart(); // consume *
                if (!line.startsWith('as')) {
                    hasError = true;
                    logError(mcx.logheader, `${fileName}:${rowNumber}: ${raw}: invalid syntax, when will this happen? (1)`);
                    return;
                }
                line = line.substring(2).trimStart(); // consume 'as'
                match = /^(?<name>\w+\s)/.exec(line);
                if (!match) {
                    hasError = true;
                    logError(mcx.logheader, `${fileName}:${rowNumber}: ${raw}: invalid syntax, when will this happen? (2)`);
                    return;
                }
                request.namespaceName = match.groups['name'].trim();
                line = line.substring(request.namespaceName.length + 1).trimStart(); // consume namespace name
            }

            if (line.startsWith('{')) {
                line = line.substring(1).trimStart(); // consume left brace
                while (true) {
                    match = /^(?<name>\w+)\s?(\s*as\s+(?<alias>\w+))?/.exec(line);
                    if (!match) {
                        break; // this is end of name list, not error
                    }
                    request.namedNames.push({ name: match.groups['name'], alias: match.groups['alias'] ?? match.groups['name'] });
                    line = line.substring(match[0].length).trimStart(); // consume name and alias
                    if (line.startsWith(',')) { line = line.substring(1).trimStart(); }// consume comma if exist
                }
                if (!line.startsWith('}')) {
                    hasError = true;
                    logError(mcx.logheader, `${fileName}:${rowNumber}: ${raw}: invalid syntax, when will this happen? (4)`);
                    return;
                }
                line = line.substring(1).trimStart(); // consume right brace
            }
            if (!line.startsWith('from ')) {
                hasError = true;
                logError(mcx.logheader, `${fileName}:${rowNumber}: ${raw}: invalid syntax, when will this happen? (5)`);
                return;
            }
            line = line.substring(5).trimStart(); // consume 'from '

            match = /^['"](?<name>.+)['"]/.exec(line);
            if (!match) {
                hasError = true;
                logError(mcx.logheader, `${fileName}:${rowNumber}: ${raw}: invalid syntax, when will this happen? (6)`);
                return;
            }
            request.moduleName = match.groups['name'];

            if (request.moduleName.startsWith('.')) {
                const name = request.namedNames.find(n => n.name != n.alias);
                if (name) {
                    hasError = true;
                    logError(mcx.logheader, `${fileName}:${rowNumber}: ${raw}: not allow import alias in relative import for now`);
                    return;
                }
            }
            module.requests.push(request);
        });
        mcx.modules.push(module);
    }

    // for (const module of modules) {
    //     console.log(`${module.path}: `);
    //     for (const request of module.requests) {
    //         console.log(`   from: ${request.moduleName}, default: ${request.defaultName
    //             || ''}, namespace: ${request.namespaceName || ''}, names: ${request.namedNames.join(',')}`);
    //     }
    // }
    return !hasError;
}

// resolve relative imports, check recursive reference, sort modules
// validate external references use same defualt name, same namespace name and same alias, merge into one external request list
// return false for not ok
// NOTE this reads mcx.modules, creates mcx.externalRequests, sorts mcx.modules
// NOTE allow same name to be imported as different alias
// NOTE sort external references by 'node:' first, then name, sort named import by alias
// NOTE if namespace import and named import are used at the same time,
//      they become one entry in mcx.externalRequests, but will generate 2 import statements in result
function validateModuleDependencies(mcx: MyPackContext): boolean {
    let hasError = false;

    mcx.externalRequests = [];
    for (const module of mcx.modules) {
        for (const moduleImport of module.requests.filter(d => !d.moduleName.startsWith('.'))) {
            const mergedImport = mcx.externalRequests.find(m => m.moduleName == moduleImport.moduleName);
            if (!mergedImport) {
                // deep clone, currently modify original object does not cause error, but don't do that
                mcx.externalRequests.push({ ...moduleImport, namedNames: [...moduleImport.namedNames] });
                continue;
            }
            /* eslint-disable @stylistic/indent-binary-ops, @stylistic/comma-dangle -- lazy to find correct formatting rules for following complex conditions */
            if (moduleImport.defaultName) {
                if (mergedImport.defaultName && mergedImport.defaultName != moduleImport.defaultName) {
                    hasError = true;
                    logError(mcx.logheader, `${module.path}: inconsistent default import from '${moduleImport.moduleName}', previous use ${mergedImport.defaultName}, here use ${moduleImport.defaultName}`);
                } else if (mcx.externalRequests.some(o => o.moduleName != moduleImport.moduleName
                    && (o.defaultName == moduleImport.defaultName || o.namespaceName == moduleImport.defaultName || o.namedNames.some(n => n.alias == moduleImport.defaultName))
                )) {
                    hasError = true;
                    logError(mcx.logheader, `${module.path}: default import ${moduleImport.defaultName} from '${moduleImport.moduleName}' has appeared in other import declarations from other modules`);
                } else if (mergedImport.namedNames.some(n => n.alias == moduleImport.defaultName)) {
                    hasError = true;
                    logError(mcx.logheader, `${module.path}: default import ${moduleImport.defaultName} from '${moduleImport.moduleName}' has appeared previous named imports from this module, when will this happen?`);
                } else if (!moduleImport.defaultName) {
                    mergedImport.defaultName = moduleImport.defaultName;
                }
            }
            if (moduleImport.namespaceName) {
                if (mergedImport.namespaceName && mergedImport.namespaceName != moduleImport.namespaceName) {
                    hasError = true;
                    logError(mcx.logheader, `${module.path}: inconsistent namespace import from '${moduleImport.moduleName}', previous use ${mergedImport.namespaceName}, here use ${moduleImport.namespaceName}`);
                } else if (mcx.externalRequests.some(o => o.moduleName != moduleImport.moduleName
                    && (o.namespaceName == moduleImport.namespaceName || o.namespaceName == moduleImport.namespaceName || o.namedNames.some(n => n.alias == moduleImport.namespaceName))
                )) {
                    hasError = true;
                    logError(mcx.logheader, `${module.path}: namespace import ${moduleImport.namespaceName} from '${moduleImport.moduleName}' has appeared in other import declarations from other modules`);
                } else if (mergedImport.namedNames.some(n => n.alias == moduleImport.namespaceName)) {
                    hasError = true;
                    logError(mcx.logheader, `${module.path}: namespace import ${moduleImport.namespaceName} from '${moduleImport.moduleName}' has appeared previous named imports from this module, when will this happen?`);
                } else if (!moduleImport.namespaceName) {
                    mergedImport.namespaceName = moduleImport.namespaceName;
                }
            }
            for (const namedName of moduleImport.namedNames) {
                if (mcx.externalRequests.some(o => o.moduleName != moduleImport.moduleName
                    && (o.defaultName == namedName.alias || o.namespaceName == namedName.alias || o.namedNames.some(n => n.alias == namedName.alias))
                )) {
                    hasError = true;
                    logError(mcx.logheader, `${module.path}: import ${namedName.alias} from '${moduleImport.moduleName}' has appeared in other import declarations`);
                } else if (mergedImport.namespaceName == namedName.alias || mergedImport.defaultName == namedName.alias) {
                    hasError = true;
                    logError(mcx.logheader, `${module.path}: import ${namedName.alias} from '${moduleImport.moduleName}' has appeared previous namespace import or default import from this module, when will this happen?`);
                } else if (mergedImport.namedNames.some(e => e.name != namedName.name && e.alias == namedName.alias)) {
                    hasError = true;
                    const previous = mergedImport.namedNames.find(e => e.name != namedName.name && e.alias == namedName.alias);
                    logError(mcx.logheader, `${module.path}: inconsistant import ${namedName.name} as ${namedName.alias} from '${moduleImport.moduleName}, previous is ${previous.name} as ${previous.alias}'`);
                }
                // name != name and alias != alias: normal different name
                // name != name and alias == alias: already reported name conflict
                // name == name and alias != alias: same name can be imported as different alias
                // name == name and alias == alias: normal same name import
                // so add record by finding alias is enough
                if (!mergedImport.namedNames.some(e => e.alias != namedName.alias)) {
                    mergedImport.namedNames.push(namedName);
                }
            }
            /* eslint-enable @stylistic/indent-binary-ops, @stylistic/comma-dangle */
        }
    }

    // sort named names by alias
    mcx.externalRequests.forEach(r => r.namedNames.sort((lhs, rhs) => lhs.alias.localeCompare(rhs.alias)));
    // sort by module name, first by starts with 'node:' first, then by name
    mcx.externalRequests.sort((lhs, rhs) => {
        const leftIsNode = lhs.moduleName.startsWith('node:');
        const rightIsNode = rhs.moduleName.startsWith('node:');
        if (leftIsNode && !rightIsNode) { return -1; }
        if (!leftIsNode && rightIsNode) { return 1; }
        // this correctly handles rest part after node: and non node module names
        return lhs.moduleName.localeCompare(rhs.moduleName);
    });

    // console.log('final external references: ');
    // for (const declaration of externalRequests) {
    //     console.log(`   from: ${declaration.moduleName}, default: ${declaration.defaultName
    //         || ''}, namespace: ${declaration.namespaceName || ''}, names: ${declaration.names.join(',')}`);
    // }

    // https://nodejs.org/api/esm.html#resolution-algorithm
    for (const module of mcx.modules) {
        for (const request of module.requests.filter(d => d.moduleName.startsWith('.'))) {
            const resolvedModuleName = [
                path.resolve(path.dirname(module.path), request.moduleName),
                path.resolve(path.dirname(module.path), request.moduleName, './index.js'),
            ].find(p => mcx.modules.some(m => m.path == p));
            if (!resolvedModuleName) {
                hasError = true;
                logError(mcx.logheader, `${module.path}: import '${request.moduleName}' not found, when will this happen?`);
                continue;
            }
            request.relativeModule = mcx.modules.find(m => m.path == resolvedModuleName);
        }
    }

    const sortedModules: MyPackModule[] = [];
    let remainingModules = [...mcx.modules];
    let remainingRelationships = mcx.modules.reduce((acc, m) => acc.concat(m.requests.filter(d => d.relativeModule)
        .map(d => ({ dependency: d.relativeModule, dependent: m }))), [] as { dependency: MyPackModule, dependent: MyPackModule }[]);
    let depth = 0;
    while (true) {
        // not importing other module
        const noDependencyModules = remainingModules.filter(m => !remainingRelationships.some(r => r.dependent === m));
        sortedModules.push(...noDependencyModules);
        remainingRelationships = remainingRelationships.filter(r => !noDependencyModules.includes(r.dependency));
        remainingModules = remainingModules.filter(m => !noDependencyModules.includes(m));
        if (remainingModules.length == 0) {
            break;
        }
        depth += 1;
        if (depth >= 10) {
            hasError = true;
            logError(mcx.logheader, `too deep dependency or recursive dependency`, remainingRelationships);
            break;
        }
    }
    // entry must be in last batch of modules, but may not be last module, you need to explicitly do that
    mcx.modules = sortedModules.filter(m => m.path != mcx.entry).concat(mcx.modules.find(m => m.path == mcx.entry));

    return !hasError;
}

// convert external references to cdn url, return false for not ok
// NOTE this reads mcx.externalRequests, sets externalRequest.cdn
async function cdnfy(mcx: MyPackContext): Promise<boolean> {
    if (!mcx.cdnfy) { return true; }
    let hasError = false;

    let projectConfig: {
        dependencies: Record<string, string>,
        devDependencies: Record<string, string>,
    };
    try {
        projectConfig = JSON.parse(await fs.readFile('package.json', 'utf-8'));
    } catch (error) {
        logError(mcx.logheader, 'failed to read package.json in cdnfy', error);
        return false;
    }
    const projectDependencies = Object
        .entries(projectConfig.dependencies)
        .concat(Object.entries(projectConfig.devDependencies))
        // substring(1): remove the '^'
        .map(([name, version]) => ({ name, version: version.substring(1) }));

    for (const request of mcx.externalRequests) {
        // find package by begin with
        // for react and react-dom/client, multiple results should select longer package name
        const packages = projectDependencies
            .filter(d => request.moduleName.startsWith(d.name))
            .sort((d1, d2) => d2.name.length - d1.name.length);
        if (packages.length == 0) {
            hasError = true;
            logError(mcx.logheader, `external reference ${request.moduleName} not found package in package.json`);
            continue;
        }
        const $package = packages[0];
        const pathname = request.moduleName.substring($package.name.length);
        request.cdn = `https://esm.sh/${$package.name}@${$package.version}${pathname}`;
    }

    return !hasError;
}

// combine into one file, return false for not ok, currently no expected error
// NOTE this reads mcx.modules, mcx.externalRequests, assign to mcx.resultJs
function combineModules(mcx: MyPackContext): boolean {

    let resultJs = '';
    for (const request of mcx.externalRequests) {
        resultJs += 'import ';
        if (request.defaultName) { resultJs += `${request.defaultName}, `; }
        if (request.namespaceName) { resultJs += `* as ${request.namespaceName}, `; }
        if (request.namespaceName && request.namedNames.length) {
            resultJs = resultJs.slice(0, -2) + ` from '${request.moduleName}'\nimport `;
        }
        if (request.namedNames.length) {
            resultJs += `{ `;
            for (const { name, alias } of request.namedNames) {
                resultJs += name == alias ? `${name}, ` : `${name} as ${alias}, `;
            }
            resultJs = resultJs.slice(0, -2) + ' }, ';
        }
        resultJs = resultJs.slice(0, -2) + ` from '${request.cdn ?? request.moduleName}'\n`;
    }
    for (const module of mcx.modules) {
        resultJs += '\n';
        for (let line of module.content.split('\n').filter(r => !r.trim().startsWith('import'))) {
            // avoid export except entry, or else terser will keep the name
            line = module.path != mcx.entry && line.startsWith('export ') ? line.substring(7) : line;
            resultJs += line + '\n';
        }
    }
    mcx.resultJs = resultJs;
    return true;
}

function filesize(size: number) {
    return size < 1024 ? `${size}b` : `${Math.round(size / 1024 * 100) / 100}kb`;
}
// if tcx is provided, it overwrites some input properties of mcx
// if you need to avoid that, avoid tcx or some of tcx properties, when do I need that?
export async function mypack(mcx: MyPackContext, tcx?: TypeScriptContext, lastmcx?: MyPackContext): Promise<MyPackContext> {
    if (tcx) {
        mcx.program = tcx.program;
        mcx.files = tcx.files;
        // ATTENTION entry is not same
        // if (!Array.isArray(tcx.entry)) { mcx.entry = tcx.entry; }
        if (tcx.target == 'browser') { mcx.cdnfy = true; }
        if (tcx.additionalLogHeader) { mcx.logheader = 'mypack' + tcx.additionalLogHeader; } else { mcx.logheader = 'mypack'; }
    } else {
        mcx.logheader = mcx.logheader ? (mcx.logheader.startsWith('mypack') ? mcx.logheader : 'mypack' + mcx.logheader) : 'mypack';
    }
    if (lastmcx) {
        // not sure whether mcx can reuse, so create new
        mcx.resultHash = lastmcx.resultHash;
        mcx.resultModules = lastmcx.resultModules;
    }
    logInfo(mcx.logheader, `pack ${mcx.entry}`);

    if (!validateTopLevelNames(mcx)) { mcx.success = false; return mcx; }
    if (!resolveModuleDependencies(mcx)) { mcx.success = false; return mcx; }
    if (!validateModuleDependencies(mcx)) { mcx.success = false; return mcx; }
    if (!await cdnfy(mcx)) { mcx.success = false; return mcx; }
    if (!combineModules(mcx)) { mcx.success = false; return mcx; }

    mcx.resultJs = await tryminify(mcx.resultJs);
    if (!mcx.resultJs) { mcx.success = false; return mcx; }

    mcx.success = true;
    const newResultHash = createHash('sha256').update(mcx.resultJs).digest('hex');
    if (newResultHash == mcx.resultHash) {
        logInfo(mcx.logheader, chalk`completed with {gray no change}`);
    } else {
        mcx.resultHash = newResultHash;
        // TODO compress result should use in uploadwithremoteconnection
        const compressSize = ` (${filesize(zstdCompressSync(mcx.resultJs).length)})`;
        logInfo(mcx.logheader, chalk`completed with {yellow 1} asset {yellow ${filesize(mcx.resultJs.length)}}${compressSize}`);
        const newResultModules = mcx.modules
            .map(m => ({ path: m.path, size: m.content.length, hash: createHash('sha256').update(m.content).digest('hex') }));
        if (mcx.resultModules) {
            for (const addedModule of newResultModules.filter(n => !mcx.resultModules.some(p => p.path == n.path))) {
                console.log(chalk`  {gray +} ${addedModule.path} ${filesize(addedModule.size)}`);
            }
            for (const [updatedModule] of newResultModules
                .map(n => [n, mcx.resultModules.find(p => p.path == n.path)] as const)
                .filter(([currentModule, previousModule]) => previousModule && currentModule.hash != previousModule.hash)) {
                console.log(chalk`  {gray *} ${updatedModule.path} ${filesize(updatedModule.size)}`);
            }
            for (const removedModule of mcx.resultModules.filter(p => !newResultModules.some(n => n.path == p.path))) {
                console.log(chalk`  {gray -} ${removedModule.path}`);
            }
        } else {
            for (const { path, size } of newResultModules) {
                console.log(chalk`   {gray +} {greenBright ${path}} ${filesize(size)}`);
            }
        }
        mcx.resultModules = newResultModules;
    }
    return mcx;
}
