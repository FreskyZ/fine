import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk-template';
import ts from 'typescript';
// NOTE when directly executing typescript, this need to be .ts
import { logInfo, logError, logCritical } from './components/common.ts';
import { validateSharedTypeDefinition, transpile } from './components/typescript.ts';
import { eslint } from './components/eslint.ts';

// assembles build scripts (akari.ts in this repository and related repositories)

const targetDirectory = process.argv[2];
if (!targetDirectory) {
    logCritical('make', 'missing target directory parameter');
}
const targetFile = path.join(targetDirectory, 'akari.ts');
const originalContent = await fs.readFile(targetFile, 'utf-8');
logInfo('make', chalk`make {cyan ${targetFile}}`);

const components = [
    'common',
    'codegen',
    'typescript',
    'eslint',
    'minify',
    'mypack',
    'sftp',
    'messenger',
];
const tcx = transpile({
    // include this file to type checking/basic linting by the way
    // this file will be excluded in the following validation automatically by the startsWith(script/components) filter
    entry: components.map(c => `script/components/${c}.ts`).concat('script/make-akari.ts'),
    target: 'node',
    additionalOptions: { noEmit: true, allowImportingTsExtensions: true, erasableSyntaxOnly: true },
});
if (!tcx.success) { process.exit(1); }

if (!await eslint({ files: 'script/components/*', ignore: ['script/components/template-client.tsx'] })) { /* process.exit(1); */ }

interface ExternalReference {
    moduleName: string,
    defaultName?: string,
    namespaceName?: string,
    typeOnly?: boolean,
    namedNames: { name: string, alias: string, typeOnly: boolean }[],
}

// a simplified version to
// - check external reference consistency
// - collect relative import relationships
// - check no duplicate top level item names
let hasError = false;
const allTopLevelNames: string[] = [];
const allTopLevelTypeNames: string[] = [];
// normal import and type import is different record in this array
// normal named name and typeonly named name is different record in namednames
const allExternalReferences: ExternalReference[] = [];
// depedency and depedent is module name/component name like 'mypack', 'typescript'
const relativeRelationships: { dependency: string, dependent: string }[] = [];

for (const sourceFile of tcx.program.getSourceFiles().filter(sf => sf.fileName.startsWith('script/components/'))) {
    const moduleFileName = sourceFile.fileName.substring(18);
    const getLocation = (node: ts.Node) => {
        const { line, character } = ts.getLineAndCharacterOfPosition(sourceFile, node.pos);
        return `${moduleFileName}:${line + 1}${character + 1}`;
    }
    const topLevelNames: string[] = [];
    const topLevelTypeNames: string[] = [];
    const references: ExternalReference[] = [];

    ts.forEachChild(sourceFile, node => {
        if (ts.isImportDeclaration(node)) {
            if (ts.isStringLiteral(node.moduleSpecifier)) {
                const reference: ExternalReference = { moduleName: node.moduleSpecifier.text, namedNames: [] };
                if (node.importClause) {
                    reference.typeOnly = node.importClause.isTypeOnly;
                    reference.defaultName = node.importClause.name?.text;
                    if (node.importClause.namedBindings && ts.isNamespaceImport(node.importClause.namedBindings)) {
                        reference.namespaceName = node.importClause.namedBindings.name.text;
                    } else if (node.importClause.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
                        for (const element of node.importClause.namedBindings.elements) {
                            if (!element.propertyName) {
                                reference.namedNames.push({ name: element.name.text, alias: element.name.text, typeOnly: element.isTypeOnly });
                            } else if (reference.moduleName.startsWith('.')) {
                                hasError = true;
                                logError('make', `${getLocation(node)}: relative import not support alias for now`);
                            } else {
                                reference.namedNames.push({ name: element.propertyName.text, alias: element.name.text, typeOnly: element.isTypeOnly });
                            }
                        }
                    }
                }
                references.push(reference);
            } // ts says if node.modulespecifier is not string literal, it is a syntax error, so ignore this else
        } else if (ts.isExportDeclaration(node)) {
            hasError = true;
            logError('make', `${getLocation(node)}: not support dedicated export statement for now`); //, node);
        } else if (ts.isVariableStatement(node)) {
            if (node.declarationList.declarations.length > 1) {
                hasError = true;
                logError('make', `${getLocation(node)} not support multiple declarations in variable declaration, I will not do that, when will that happen?`);
                return;
            }
            const declaration = node.declarationList.declarations[0];
            if (ts.isIdentifier(declaration.name)) {
                topLevelNames.push(declaration.name.text);
            } else if (ts.isObjectBindingPattern(declaration.name) || ts.isArrayBindingPattern(declaration.name)) {
                // recursively extract names from nested binding patterns
                const extractNames = (bindingPattern: ts.ObjectBindingPattern | ts.ArrayBindingPattern) => {
                    for (const element of bindingPattern.elements) {
                        // array binding pattern only have an additional omitexpression in elements, which is not interested here, so a isBindingElement can handle both
                        // if you want to omit the if and use .filter, typescript currently still don't understand for element in elements.filter(ts.isBindingElement)
                        if (ts.isBindingElement(element)) {
                            if (ts.isIdentifier(element.name)) {
                                topLevelNames.push(element.name.text);
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
                topLevelNames.push(node.name.text);
            }
        } else if (ts.isClassDeclaration(node)) {
            if (node.name) {
                topLevelNames.push(node.name.text);
                topLevelTypeNames.push(node.name.text);
            }
        } else if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) {
            // type name is in another namespace
            topLevelTypeNames.push(node.name.text);
        } else if (ts.isExpressionStatement(node) || ts.isForOfStatement(node) || ts.isIfStatement(node)) {
            // top level expression and normal statements will not define new name
        } else if (node.kind == 1) {
            // EOF token
        } else {
            hasError = true;
            logError('make', `${getLocation(node)}: unhandled top level node kind: ${ts.SyntaxKind[node.kind]}`); //, node);
        }
    });

    // NOTE: too complex to check duplicate names, let nodejs check that
    for (const reference of references.filter(r => !r.moduleName.startsWith('.'))) {
        if (!allExternalReferences.some(r => r.moduleName == reference.moduleName && r.typeOnly == reference.typeOnly)) {
            allExternalReferences.push(reference);
        } else {
            const merged = allExternalReferences.find(r => r.moduleName == reference.moduleName && r.typeOnly == reference.typeOnly);
            if (merged.defaultName && reference.defaultName && merged.defaultName != reference.defaultName) {
                hasError = true;
                logError('make', `${moduleFileName}: inconsistent default import from ${reference.moduleName}, previous ${merged.defaultName} current ${reference.defaultName}`);
            } else if (!merged.defaultName && reference.defaultName) {
                merged.defaultName = reference.defaultName;
            }
            if (merged.namespaceName && reference.namespaceName && merged.namespaceName != reference.namespaceName) {
                hasError = true;
                logError('make', `${moduleFileName}: inconsistent namespace import from ${reference.moduleName}, previous ${merged.namespaceName} current ${reference.namespaceName}`);
            } else if (!merged.namespaceName && reference.namespaceName) {
                merged.namespaceName = reference.namespaceName;
            }
            for (const namedName of reference.namedNames) {
                if (!merged.namedNames.some(m => m.name == namedName.name && m.alias == namedName.alias && m.typeOnly == namedName.typeOnly)) {
                    merged.namedNames.push({ ...namedName });
                }
            }
        }
    }

    const moduleName = moduleFileName.substring(0, moduleFileName.length - 3);
    for (const reference of references.filter(r => r.moduleName.startsWith('./'))) {
        // remove leading './' and trailing '.ts'
        const referenceModuleName = reference.moduleName.substring(2, reference.moduleName.length - 3);
        if (!components.includes(referenceModuleName)) {
            hasError = true;
            logError('make', `${moduleFileName}: unknown relative import ${reference.moduleName}`);
        } else if (!relativeRelationships.some(r => r.dependency == referenceModuleName && r.dependent == moduleName)) {
            relativeRelationships.push({ dependency: referenceModuleName, dependent: moduleName });
        }
    }

    const duplicateTopLevelNames = topLevelNames.filter(n => allTopLevelNames.includes(n));
    if (duplicateTopLevelNames.length) {
        hasError = true;
        logError('make', `${moduleFileName}: duplicate top level names: ${topLevelNames.join(', ')}`);
    }
    topLevelNames.forEach(n => allTopLevelNames.push(n));
    const duplicateTopLevelTypeNames = topLevelTypeNames.filter(n => allTopLevelTypeNames.includes(n));
    if (duplicateTopLevelTypeNames.length) {
        hasError = true;
        logError('make', `${moduleFileName}: duplicate top level type names: ${duplicateTopLevelTypeNames.join(', ')}`);
    }
    topLevelTypeNames.forEach(n => allTopLevelTypeNames.push(n));
}

// sort named names by alias
allExternalReferences.forEach(r => r.namedNames.sort((lhs, rhs) => lhs.alias.localeCompare(rhs.alias)));
// sort by module name, first by starts with 'node:' first, then by name
allExternalReferences.sort((lhs, rhs) => {
    const leftIsNode = lhs.moduleName.startsWith('node:');
    const rightIsNode = rhs.moduleName.startsWith('node:');
    if (leftIsNode && !rightIsNode) return -1;
    if (!leftIsNode && rightIsNode) return 1;
    // this correctly handles rest part after node: and non node module names
    return lhs.moduleName.localeCompare(rhs.moduleName);
});

const sortedModuleNames: string[] = [];
let remainingModuleNames = [...components];
let remainingRelationships = [...relativeRelationships];
let depth = 0;
while (true) {
    // not importing other module
    const noDependencyModules = remainingModuleNames.filter(m => !remainingRelationships.some(r => r.dependent == m));
    sortedModuleNames.push(...noDependencyModules);
    remainingRelationships = remainingRelationships.filter(r => !noDependencyModules.includes(r.dependency));
    remainingModuleNames = remainingModuleNames.filter(m => !noDependencyModules.includes(m));
    if (remainingModuleNames.length == 0) {
        break;
    }
    depth += 1;
    if (depth >= 10) {
        hasError = true;
        logError('make', `too deep dependency or recursive dependency`, remainingRelationships);
        break;
    }
}
// console.log(sortedModuleNames);
// console.log(allTopLevelNames, allTopLevelTypeNames);
// console.log(JSON.stringify(allExternalReferences, undefined, 2));
if (hasError) { process.exit(1); }

// validate shared type between messenger and remote-akari
// no need to make make-akari fail if mismatch
if (!await validateSharedTypeDefinition('script/remote-akari.ts', 'script/components/messenger.ts', 'BuildScriptMessage')) { /* process.exit(1); */ }

// although the previous process.exit(1) makes this has error always true, still keep it in case process is not exited
hasError = false;
let state: 'manual-import' | 'component-decl' | 'library' | 'manual-script' = 'manual-import';
const manualImportLines: string[] = [];
const requestedComponents: string[] = [];
const libraryHasher = crypto.createHash('sha256');
const manualScriptLines: string[] = [];
for (const [line, rowNumber] of originalContent.split('\n').map((r, i) => [r, i + 1] as const)) {
    if (state == 'manual-import') {
        if (line == '// END IMPORT') {
            state = 'component-decl';
        } else if (line.trim()) { // ignore empty or whitespace line
            manualImportLines.push(line); // but don't add trim
        }
    } else if (state == 'component-decl') {
        if (line.startsWith('// components: ')) {
            const rawComponents = line.substring(14).trim().split(',').map(x => x.trim()).filter(x => x);
            const unrecognizedComponents = rawComponents.filter(c => !components.includes(c));
            if (unrecognizedComponents.length) {
                hasError = true;
                logError('make', `${targetFile}:${rowNumber}: unrecognized components: ${unrecognizedComponents.length}`);
            }
            requestedComponents.push(...rawComponents.filter(c => components.includes(c)));
            if (!requestedComponents.includes('common')) { requestedComponents.push('common'); }
        } else if (line == '// BEGIN LIBRARY') {
            state = 'library';
        } else {
            hasError = true;
            logError('make', `${targetFile}:${rowNumber}: expecting components declaration`);
        }
    } else if (state == 'library') {
        if (line.startsWith('// END LIBRARY')) {
            state = 'manual-script';
            const actualHash = line.substring(15);
            const expectHash = libraryHasher.digest('hex');
            if (actualHash != expectHash) {
                const actualShortHash = actualHash.substring(0, 6);
                const expectShortHash = expectHash.substring(0, 6);
                if (actualShortHash != expectShortHash) {
                    logError('make', `${targetFile}: hash mismatch expect ${expectShortHash} actual ${actualShortHash}`);
                } else {
                    logError('make', `${targetFile}: hash mismatch expect ${expectHash} actual ${actualHash}`);
                }
                if (!process.env['AKARIN_IGNORE_HASH_MISMATCH']) {
                    logError('make', `generated content seems unexpectedly changed, use AKARIN_IGNORE_HASH_MISMATCH to ignore and overwrite`);
                    process.exit(1);
                }
            }
        } else {
            libraryHasher.update(line + '\n');
        }
    } else if (state == 'manual-script') {
        manualScriptLines.push(line);
    }
}
// console.log(manualImportLines);
// console.log(requestedComponents);
// console.log(manualScriptLines.slice(0, 10));
if (hasError) { process.exit(1); }

let sb = '';
for (const line of manualImportLines) {
    sb += line + '\n';
}
sb += '// END IMPORT\n';
sb += `// components: ${requestedComponents.join(', ')}\n`;
sb += '// BEGIN LIBRARY\n';
const beginLibraryIndex = sb.length;

for (const reference of allExternalReferences) {
    sb += 'import ';
    if (reference.typeOnly) { sb += 'type '; }
    if (reference.defaultName) { sb += `${reference.defaultName}, `; }
    if (reference.namespaceName) { sb += `* as ${reference.namespaceName}, `; }
    if (reference.namespaceName && reference.namedNames.length) {
        sb = sb.slice(0, -2) + ` from \'${reference.moduleName}\'\nimport `;
    }
    if (reference.namedNames.length) {
        sb += `{ `;
        for (const { name, alias, typeOnly } of reference.namedNames) {
            if (typeOnly) { sb += 'type '; }
            if (name == alias) { sb += `${name}, `; }
            else { sb += `${name} as ${alias}, `; }
        }
        sb = sb.slice(0, -2) + ' }, ';
    }
    sb = sb.slice(0, -2) + ` from \'${reference.moduleName}\';\n`;
}
for (const moduleName of sortedModuleNames.filter(m => requestedComponents.includes(m))) {
    const modulePath = `script/components/${moduleName}.ts`;
    // removing leading and trailing empty lines
    const moduleContent = tcx.program.getSourceFile(modulePath).text.trim();
    // console.log(`${moduleName}: ${moduleContent.substring(0, 100)}\n...\n${moduleContent.substring(moduleContent.length - 100)}`);
    sb += '\n';
    // ?
    const headerBlockLength = Math.max(modulePath.length, 24);
    const filled = (length: number) => length <= 0 ? '' : new Array(length).fill('-').join('');
    sb += '// ' + filled(headerBlockLength + 14) + '\n';
    sb += `// ------${filled(Math.ceil((headerBlockLength - modulePath.length) / 2))} ${modulePath} ${filled(Math.floor((headerBlockLength - modulePath.length) / 2))}------ \n`;
    sb += `// ------${filled(Math.ceil((headerBlockLength - 24) / 2))} ATTENTION AUTO GENERATED ${filled(Math.floor((headerBlockLength - 24) / 2))}------\n`;
    sb += '// ' + filled(headerBlockLength + 14) + '\n';
    for (let line of moduleContent.split('\n')) {
        if (line.trim().startsWith('import ')) { continue; }
        if (line.trimStart().startsWith('export ')) { line = line.trimStart().substring(7); }
        if (line.includes('template-client.tsx')) {
            const rawTemplateContent = await fs.readFile('script/components/template-client.tsx', 'utf-8');
            const beginTempltateIndex = rawTemplateContent.indexOf('// BEGIN TEMPLATE\n');
            const templateContent = rawTemplateContent.substring(beginTempltateIndex + 18);
            // ATTENTION for now you can simply replaceall
            // if there are other $ symbol or non string template '`' then you need to lexical parse the content
            line = line.replace('template-client.tsx', templateContent.replaceAll('`', '\\`').replaceAll('${', '\\${'));
        }
        sb += line + '\n';
    }
}
sb += `// END LIBRARY ${crypto.hash('sha256', sb.substring(beginLibraryIndex))}\n`;
for (const line of manualScriptLines) {
    sb += line + '\n';
}
sb = sb.trimEnd() + '\n';
logInfo('make', `writing ${targetFile}`);
await fs.writeFile(targetFile, sb);
logInfo('make', chalk`make {cyan ${targetFile}} completed successfully`);
