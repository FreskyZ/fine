import readline from 'node:readline/promises';
// END IMPORT
// components: minify, mypack, sftp, typescript, messenger, eslint, common
// BEGIN LIBRARY
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Interface } from 'node:readline/promises';
import tls from 'node:tls';
import { zstdCompress, zstdCompressSync } from 'node:zlib';
import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import chalkNotTemplate from 'chalk';
import chalk from 'chalk-template';
import dayjs from 'dayjs';
import { ESLint } from 'eslint';
import { XMLParser } from 'fast-xml-parser';
import SFTPClient from 'ssh2-sftp-client';
import { minify } from 'terser';
import ts from 'typescript';
import tseslint from 'typescript-eslint';

// -----------------------------------------
// ------ script/components/common.ts ------ 
// -------- ATTENTION AUTO GENERATED -------
// -----------------------------------------

function logInfo(header: string, message: string, error?: any): void {
    if (error) {
        console.log(chalk`[{green ${dayjs().format('HH:mm:ss.SSS')}} {gray ${header}}] ${message}`, error);
    } else {
        console.log(chalk`[{green ${dayjs().format('HH:mm:ss.SSS')}} {gray ${header}}] ${message}`);
    }
}
function logError(header: string, message: string, error?: any): void {
    if (error) {
        console.log(chalk`[{green ${dayjs().format('HH:mm:ss.SSS')}} {red ${header}}] ${message}`, error);
    } else {
        console.log(chalk`[{green ${dayjs().format('HH:mm:ss.SSS')}} {red ${header}}] ${message}`);
    }
}
function logCritical(header: string, message: string): never {
    console.log(chalk`[{green ${dayjs().format('HH:mm:ss.SSS')}} {red ${header}}] ${message}`);
    return process.exit(1);
}

// build script's config (akari.json), or config for code in 'script' folder,
// to be distinguished with codegen config (api.xml and database.xml) and core config (/webroot/config)
interface ScriptConfig {
    domain: string,
    webroot: string,
    certificate: string,
    ssh: { user: string, identity: string, passphrase: string },
}
const scriptconfig: ScriptConfig = JSON.parse(await fs.readFile('akari.json', 'utf-8'));

// ---------------------------------------------
// ------ script/components/typescript.ts ------ 
// ---------- ATTENTION AUTO GENERATED ---------
// ---------------------------------------------

interface TypeScriptContext {
    entry: string | string[],
    // not confused with ts.ScriptTarget
    // for now this add lib.dom.d.ts to lib, add jsx: ReactJSX
    target: 'browser' | 'node',
    // should come from process.env.AKARIN_STRICT
    // in old days I enabled this and meet huge amount of false positives,
    // so instead of always on/off, occassionally use this to check for potential issues
    strict?: boolean,
    additionalOptions?: ts.CompilerOptions,
    additionalLogHeader?: string,
    program?: ts.Program,
    // transpile success
    success?: boolean,
    // transpile result files
    files?: Record<string, string>,
}

// extract SHARED TYPE xxx from source file and target file and compare they are same
// although this works on string, still put it here because it logically work on type definition
// return false for not ok
async function validateSharedTypeDefinition(sourceFile: string, targetFile: string, typename: string): Promise<boolean> {

    const sourceContent = await fs.readFile(sourceFile, 'utf-8');
    const expectLines = getSharedTypeDefinition(sourceFile, sourceContent, typename);
    if (!expectLines) { return false; }

    const targetContent = await fs.readFile(targetFile, 'utf-8');
    const actualLines = getSharedTypeDefinition(targetFile, targetContent, typename);
    if (!actualLines) { return false; }

    // console.log(expectLines, actualLines);
    if (expectLines.length != actualLines.length) {
        logError('share-type', `mismatched SHARED TYPE ${typename} between ${sourceFile} and ${targetFile}, expect ${expectLines.length} lines, actual ${actualLines.length} lines`);
        return false;
    }
    for (const [i, expect] of expectLines.map((r, i) => [i, r] as const)) {
        if (expect != actualLines[i]) {
            logError('share-type', `mismatched SHARED TYPE ${typename} between ${sourceFile} and ${targetFile}, line ${i + 1}:`);
            console.log('   expect: ', expect);
            console.log('   actual: ', actualLines[i]);
            return false;
        }
    }
    return true;

    function getSharedTypeDefinition(filename: string, originalContent: string, name: string): string[] {
        let state: 'before' | 'inside' | 'after' = 'before';
        const result: string[] = [];
        for (const line of originalContent.split('\n')) {
            if (state == 'before' && line == `// BEGIN SHARED TYPE ${name}`) {
                state = 'inside';
            } else if (state == 'inside' && line == `// END SHARED TYPE ${name}`) {
                state = 'after';
            } else if (state == 'inside') {
                result.push(line);
            }
        }
        if (state == 'before') {
            logError('share-type', `${filename}: missing shared type ${name}`);
            return null;
        } else if (state == 'inside') {
            logError('share-type', `${filename}: unexpected EOF in shared type ${name}`);
            return null;
        }
        return result;
    }
}

function transpile(tcx: TypeScriptContext): TypeScriptContext {
    const logheader = `tsc${tcx.additionalLogHeader ?? ''}`;
    logInfo(logheader, 'transpiling');

    // design considerations
    // - the original tool distinguishes ecma module and commonjs, now everything is esm!
    //   the target: esnext, module: nodenext, moduleres: nodenext seems suitable for all usage
    // - no source map
    //   the original core module include source map and do complex error logs,
    //   but that work really should not be put in core module and that's now removed
    //   currently the minify option to split result in 160 char wide lines is very enough
    //   the result backend bundle file and front end js files is currently actually very human readable
    // - jsx, I was providing my own jsx implementation,
    //   but that's now handled by /** @jsxImportSource @emotion/react */, so no work for me
    // - watch is not used in current remote command center architecture
    //
    // NOTE check https://www.typescriptlang.org/tsconfig/ for new features and options
    tcx.program = ts.createProgram(Array.isArray(tcx.entry) ? tcx.entry : [tcx.entry], {
        lib: ['lib.esnext.d.ts'].concat(tcx.target == 'browser' ? ['lib.dom.d.ts'] : []),
        jsx: tcx.target == 'browser' ? ts.JsxEmit.ReactJSX : undefined,
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        skipLibCheck: true,
        noEmitOnError: true,
        strict: tcx.strict,
        allowUnreachableCode: false,
        allowUnusedLabels: false,
        alwaysStrict: true,
        exactOptionalPropertyTypes: tcx.strict,
        noFallthroughCaseInSwitch: true,
        noImplicitAny: true,
        noImplicitReturns: true,
        noImplicitThis: true,
        noPropertyAccessFromIndexSignature: true,
        noUnusedLocals: true,
        noUnusedParameters: true,
        strictNullChecks: tcx.strict,
        strictFunctionTypes: true,
        strictBindCallApply: true,
        strictBuiltinIteratorReturn: true,
        strictPropertyInitialization: tcx.strict,
        removeComments: true,
        outDir: '/vbuild',
        ...tcx.additionalOptions,
    });

    tcx.files ??= {};
    const emitResult = tcx.program.emit(undefined, (fileName, data) => {
        if (data) { tcx.files[fileName] = data; }
    });

    // TODO the typescript level top level item tree shaking is nearly completed by the unusedvariable, etc. check
    // the only gap is an item is declared as export but not used by other modules
    // the complexity of this check is even reduced by named imports in ecma module compare to commonjs module,
    // although default import and namespace import still exists, soyou still need typescript type information
    // to find top level item usages, so still need something to be collected here?

    const diagnostics = tcx.additionalOptions?.noEmit ? [
        // why are there so many kinds of diagnostics? do I need all of them?
        tcx.program.getGlobalDiagnostics(),
        tcx.program.getOptionsDiagnostics(),
        tcx.program.getSemanticDiagnostics(),
        tcx.program.getSyntacticDiagnostics(),
        tcx.program.getDeclarationDiagnostics(),
        tcx.program.getConfigFileParsingDiagnostics(),
    ].flat() : emitResult.diagnostics;

    const errorCount = diagnostics.filter(d => d.category == ts.DiagnosticCategory.Error || ts.DiagnosticCategory.Warning).length;
    const normalCount = diagnostics.length - errorCount;

    let message: string;
    if (normalCount == 0 && errorCount == 0) {
        message = 'no diagnostic';
    } else if (normalCount != 0 && errorCount == 0) {
        message = chalk`{yellow ${normalCount}} infos`;
    } else if (normalCount == 0 /* && errorCount != 0 */) {
        message = chalk`{yellow ${errorCount}} errors`;
    } else /* normalCount != 0 && errorCount != 0 */ {
        message = chalk`{yellow ${errorCount}} errors and {yellow ${normalCount}} infos`;
    }

    tcx.success = diagnostics.length == 0;
    (diagnostics.length ? logError : logInfo)(logheader, `completed with ${message}`);
    for (const { category, code, messageText, file, start } of diagnostics) {
        const displayColor = {
            [ts.DiagnosticCategory.Warning]: chalkNotTemplate.red,
            [ts.DiagnosticCategory.Error]: chalkNotTemplate.red,
            [ts.DiagnosticCategory.Suggestion]: chalkNotTemplate.green,
            [ts.DiagnosticCategory.Message]: chalkNotTemplate.cyan,
        }[category];
        const displayCode = displayColor(`  TS${code} `);

        let fileAndPosition = '';
        if (file && start) {
            const { line, character: column } = ts.getLineAndCharacterOfPosition(file, start);
            fileAndPosition = chalk`{yellow ${file.fileName}:${line + 1}:${column + 1}} `;
        }

        let flattenedMessage = ts.flattenDiagnosticMessageText(messageText, '\n');
        if (flattenedMessage.includes('\n')) {
            flattenedMessage = '\n' + flattenedMessage;
        }
        console.log(displayCode + fileAndPosition + flattenedMessage);
    }
    return tcx;
}

// -----------------------------------------
// ------ script/components/eslint.ts ------ 
// -------- ATTENTION AUTO GENERATED -------
// -----------------------------------------

interface ESLintOptions {
    files: string | string[], // pattern
    ignore?: string[], // pattern
    falsyRules?: boolean, // enable falsy rules to check for postential true positives
    additionalLogHeader?: string,
}
// return false for has issues, but build scripts may not fail on this
async function eslint(options: ESLintOptions): Promise<boolean> {
    const eslint = new ESLint({
        ignorePatterns: options.ignore,
        overrideConfigFile: true,
        plugins: {
            tseslint: tseslint.plugin as any,
            stylistic,
        },
        // ??? these 3 packages use 3 different patterns to provide recommended configurations?
        overrideConfig: [
            js.configs.recommended,
            stylistic.configs.recommended,
            ...tseslint.configs.recommended as any,
            {
                linterOptions: {
                    reportUnusedDisableDirectives: true,
                },
                rules: {
                    // when-I-use-I-really-need-to-use
                    '@typescript-eslint/no-explicit-any': 'off',
                    // when-I-use-I-really-need-to-use
                    // why do I need to expecting error? I ts-ignore because ts is not clever enough, I do not expect error
                    '@typescript-eslint/ban-ts-comment': 'off',
                    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
                    // not interested
                    '@stylistic/arrow-parens': 'off',
                    // document says default 1tbs but errors say not
                    '@stylistic/brace-style': options.falsyRules ? ['error', '1tbs', { 'allowSingleLine': true }] : 'off',
                    // document says default 4 but errors say default 2, UPDATE: too many false positive on nested ternery expression
                    '@stylistic/indent': options.falsyRules ? ['error', 4] : 'off',
                    // why is this a separate rule with 2 space idention?
                    '@stylistic/indent-binary-ops': 'off',
                    // not sufficient option to follow my convention
                    '@stylistic/jsx-closing-bracket-location': 'off',
                    // not sufficient option to follow my convention, who invented the very strange default value?
                    '@stylistic/jsx-closing-tag-location': 'off',
                    // not sufficient option to follow my convention
                    '@stylistic/jsx-first-prop-new-line': 'off',
                    // no, fragment already looks like newline
                    '@stylistic/jsx-function-call-newline': 'off',
                    // I'm tired of indenting props according to formatting rules
                    '@stylistic/jsx-indent-props': 'off',
                    // when-I-use-I-really-need-to-use
                    '@stylistic/jsx-one-expression-per-line': 'off',
                    // I need negative rule
                    '@stylistic/jsx-wrap-multilines': 'off',
                    // it's meaningless to move properties to next line and fight with idention rules
                    '@stylistic/jsx-max-props-per-line': 'off',
                    '@stylistic/jsx-quotes': 'off',
                    // when-I-use-I-really-need-to-use
                    '@stylistic/max-statements-per-line': 'off',
                    '@stylistic/member-delimiter-style': ['error', {
                        'multiline': {
                            'delimiter': 'comma',
                            'requireLast': true,
                        },
                        'singleline': {
                            'delimiter': 'comma',
                            'requireLast': false,
                        },
                    }],
                    // I'm tired of indenting/spacing ternary expressions according formatting rules
                    '@stylistic/multiline-ternary': 'off',
                    '@stylistic/no-multi-spaces': ['error', { ignoreEOLComments: true }],
                    // not interested
                    '@stylistic/padded-blocks': 'off',
                    // in old days I say it's not possible to enable on existing code base
                    // now I say it's not possible to enforcing overall code base
                    '@stylistic/quotes': 'off',
                    '@stylistic/quote-props': ['error', 'consistent'],
                    '@stylistic/semi': ['error', 'always'],
                },
            },
        ],
    });

    const lintResults = await eslint.lintFiles(options.files);

    let hasIssue = false;
    // // the default formatter is extremely bad when one message is long, so have to implement on your own
    // const formattedResults = (await eslint.loadFormatter('stylish')).format(lintResults);
    // if (formattedResults) { console.log(formattedResults); }
    for (const fileResult of lintResults) {
        if (fileResult.errorCount == 0) { continue; }
        hasIssue = true;
        const relativePath = path.relative(process.cwd(), fileResult.filePath);
        console.log(chalk`\n${relativePath} {yellow ${fileResult.errorCount}} errors`);
        for (const message of fileResult.messages) {
            console.log(chalk`{gray ${message.line}:${message.column}} ${message.message} {gray ${message.ruleId}}`);
        }
    }

    if (!hasIssue) { logInfo(`eslint${options.additionalLogHeader ?? ''}`, 'clear'); }
    return !hasIssue;
}

// -----------------------------------------
// ------ script/components/minify.ts ------ 
// -------- ATTENTION AUTO GENERATED -------
// -----------------------------------------

// the try catch structure of minify is hard to use, return null for not ok
async function tryminify(input: string) {
    try {
        const minifyResult = await minify(input, {
            module: true,
            compress: { ecma: 2022 as any },
            format: { max_line_len: 160 },
        });
        return minifyResult.code;
    } catch (err) {
        logError('terser', `minify error`, { err, input });
        return null;
    }
}

// ---------------------------------------
// ------ script/components/sftp.ts ------ 
// ------- ATTENTION AUTO GENERATED ------
// ---------------------------------------

interface UploadAsset {
    data: string | Buffer,
    remote: string, // relative path to webroot
}

// return false for not ok
// nearly every text file need replace example.com to real domain,
// so change this function to 'deploy' to make it reasonable to do the substitution,
// use buffer or Buffer.from(string) to skip that
async function deploy(assets: UploadAsset[]): Promise<boolean> {
    const client = new SFTPClient();
    try {
        await client.connect({
            host: scriptconfig.domain,
            username: scriptconfig.ssh.user,
            privateKey: await fs.readFile(scriptconfig.ssh.identity),
            passphrase: scriptconfig.ssh.passphrase,
        });
        for (const asset of assets) {
            const fullpath = path.join(scriptconfig.webroot, asset.remote);
            await client.mkdir(path.dirname(fullpath), true);
            if (!Buffer.isBuffer(asset.data)) {
                asset.data = Buffer.from(asset.data.replaceAll('example.com', scriptconfig.domain));
            }
            await client.put(asset.data, fullpath);
        }
        logInfo('sftp', chalk`upload {yellow ${assets.length}} files ${assets.map(a => chalkNotTemplate.yellow(path.basename(a.remote)))}`);
        return true;
    } catch (error) {
        logError('sftp', 'failed to upload', error);
        return false;
    } finally {
        await client.end();
    }
}

// -----------------------------------------
// ------ script/components/mypack.ts ------ 
// -------- ATTENTION AUTO GENERATED -------
// -----------------------------------------

interface MyPackContext {
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
async function mypack(mcx: MyPackContext, tcx?: TypeScriptContext, lastmcx?: MyPackContext): Promise<MyPackContext> {
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

// --------------------------------------------
// ------ script/components/messenger.ts ------ 
// --------- ATTENTION AUTO GENERATED ---------
// --------------------------------------------

// messenger: message sender abbreviated as messenger

// use this to avoid global variables because currently no other major global variables used
/* eslint-disable @stylistic/quote-props -- no */
interface MessengerContext {
    '?'?: boolean, // ?
    readline: Interface,
    connection?: WebSocket,
    // id to waker (the promise resolver)
    wakers?: Record<number, (data: BuildScriptMessageResponse) => void>,
    nextMessageId?: number,
    reconnectCount?: number,
    // store last mcx for report
    mcx?: MyPackContext,
}

// return true for connected
async function connectRemote(ecx: MessengerContext) {
    if (!ecx['?']) {
        // ???
        const myCertificate = await fs.readFile(scriptconfig.certificate, 'utf-8');
        const originalCreateSecureContext = tls.createSecureContext;
        tls.createSecureContext = options => {
            const originalResult = originalCreateSecureContext(options);
            if (!options.ca) {
                originalResult.context.addCACert(myCertificate);
            }
            return originalResult;
        };
        ecx['?'] = true;
        // this place exactly can use to initialize member fields
        ecx.reconnectCount = 0;
        ecx.nextMessageId = 1;
        ecx.wakers = {};
    }
    if (ecx.reconnectCount >= 3) {
        ecx.reconnectCount = 0;
        logError('messenger', 'connect retry time >= 3, you may manually reconnect later');
        return false;
    }

    return new Promise<boolean>(resolve => {
        const websocket = new WebSocket(`wss://${scriptconfig.domain}:8001`, 'akari');

        // the close event may not be called after error event is called
        // but normally will, use this to avoid duplicate invocation of reconnect
        // https://stackoverflow.com/questions/38181156/websockets-is-an-error-event-always-followed-by-a-close-event
        let reconnectInvoked = false;

        websocket.addEventListener('open', async () => {
            ecx.reconnectCount = 0;
            logInfo('messenger', `connected, you'd better complete authentication quickly`);
            const token = await ecx.readline.question('> ');
            websocket.send(token);
        });
        websocket.addEventListener('close', async () => {
            logInfo('messenger', `websocket disconnected`);
            if (!reconnectInvoked) {
                ecx.reconnectCount += 1;
                resolve(await connectRemote(ecx));
            }
        });
        websocket.addEventListener('error', async error => {
            logInfo('messenger', `websocket error:`, error);
            reconnectInvoked = true;
            ecx.reconnectCount += 1;
            resolve(await connectRemote(ecx));
        });

        websocket.addEventListener('message', async event => {
            if (event.data == 'authenticated') {
                ecx.connection = websocket;
                logInfo('messenger', 'websocket received authenticated');
                // this resolve should be most normal case
                resolve(true);
            } else {
                logInfo('messenger', 'websocket received', event.data);
                try {
                    const response = JSON.parse(event.data);
                    if (!response.id) {
                        logError('messenger', `received response without id, when will this happen?`);
                    } else if (!(response.id in ecx.wakers)) {
                        logError('messenger', `no waker found for received response, when will this happen?`);
                    } else {
                        ecx.wakers[response.id](response);
                        delete ecx.wakers[response.id];
                    }
                } catch (error) {
                    logError('messenger', `received data failed to parse json`, error);
                }
            }
        });
    });
}

/* eslint-disable @stylistic/operator-linebreak -- false positive for type X =\n| Variant1\n| Variant2 */
// BEGIN SHARED TYPE BuildScriptMessage
interface HasId {
    id: number,
}

// received packet format
// - magic: NIRA, packet id: u16le, kind: u8
// - kind: 1 (file), file name length: u8, filename: not zero terminated, buffer length: u32le, buffer
// - kind: 2 (admin), command kind: u8
//   - command kind: 1 (static-content:reload), key length: u8, key: not zero terminated
//   - command kind: 2 (app:reload-server), app length: u8, app: not zero terminated
// - kind: 3 (reload-browser)
interface BuildScriptMessageUploadFile {
    kind: 'file',
    filename: string,
    content: Buffer, // this is compressed
}
interface BuildScriptMessageAdminInterfaceCommand {
    kind: 'admin',
    command:
        // remote-akari knows AdminInterfaceCommand type, local akari don't
        // this also explicitly limit local admin command range, which is ok
        | { kind: 'static-content:reload', key: string }
        | { kind: 'app:reload-server', name: string },
}
interface BuildScriptMessageReloadBrowser {
    kind: 'reload-browser',
}
type BuildScriptMessage =
    | BuildScriptMessageUploadFile
    | BuildScriptMessageAdminInterfaceCommand
    | BuildScriptMessageReloadBrowser;

// response packet format
// - magic: NIRA, packet id: u16le, kind: u8
// - kind: 1 (file), status: u8
// - kind: 2 (admin)
// - kind: 3 (reload-browser)
interface BuildScriptMessageResponseUploadFile {
    kind: 'file',
    // filename path is not in returned data but assigned at local side
    filename?: string,
    // no error message in response, it is displayed here
    status: 'ok' | 'error' | 'nodiff',
}
interface BuildScriptMessageResponseAdminInterfaceCommand {
    kind: 'admin',
    // command is not in returned data but assigned at local side
    command?: BuildScriptMessageAdminInterfaceCommand['command'],
    // response is not in returned data but displayed here
}
interface BuildScriptMessageResponseReloadBrowser {
    kind: 'reload-browser',
}
type BuildScriptMessageResponse =
    | BuildScriptMessageResponseUploadFile
    | BuildScriptMessageResponseAdminInterfaceCommand
    | BuildScriptMessageResponseReloadBrowser;
// END SHARED TYPE BuildScriptMessage

async function sendRemoteMessage(ecx: MessengerContext, message: BuildScriptMessageUploadFile): Promise<BuildScriptMessageResponseUploadFile>;
async function sendRemoteMessage(ecx: MessengerContext, message: BuildScriptMessageAdminInterfaceCommand): Promise<BuildScriptMessageResponseAdminInterfaceCommand>;
async function sendRemoteMessage(ecx: MessengerContext, message: BuildScriptMessageReloadBrowser): Promise<BuildScriptMessageResponseReloadBrowser>;
async function sendRemoteMessage(ecx: MessengerContext, message: BuildScriptMessage): Promise<BuildScriptMessageResponse> {
    if (!ecx.connection) {
        logError('messenger', "not connected, type 'connect remote' to reconnect");
        return null;
    }

    const messageId = ecx.nextMessageId;
    ecx.nextMessageId += 1;

    let buffer: Buffer;
    if (message.kind == 'file') {
        buffer = Buffer.alloc(12 + message.filename.length + message.content.length);
        buffer.write('NIRA', 0); // magic size 4
        buffer.writeUInt16LE(messageId, 4); // packet id size 2
        buffer.writeUInt8(1, 6); // kind size 1
        buffer.writeUInt8(message.filename.length, 7); // file name length size 1
        buffer.write(message.filename, 8);
        buffer.writeUInt32LE(message.content.length, message.filename.length + 8); // content length size 4
        message.content.copy(buffer, 12 + message.filename.length, 0);
        logInfo('messenger', `send #${messageId} file ${message.filename} compress size ${message.content.length}`);
    } else if (message.kind == 'admin') {
        if (message.command.kind == 'static-content:reload') {
            buffer = Buffer.alloc(9 + message.command.key.length);
            buffer.write('NIRA', 0); // magic size 4
            buffer.writeUInt16LE(messageId, 4); // packet id size 2
            buffer.writeUInt8(2, 6); // kind size 1
            buffer.writeUInt8(1, 7); // command kind size 1
            buffer.writeUInt8(message.command.key.length, 8); // key length size 1
            buffer.write(message.command.key, 9);
            logInfo('messenger', `send #${messageId} static-content:reload ${message.command.key}`);
        } else if (message.command.kind == 'app:reload-server') {
            buffer = Buffer.alloc(9 + message.command.name.length);
            buffer.write('NIRA', 0); // magic size 4
            buffer.writeUInt16LE(messageId, 4); // packet id size 2
            buffer.writeUInt8(2, 6); // kind size 1
            buffer.writeUInt8(2, 7); // command kind size 1
            buffer.writeUInt8(message.command.name.length, 8); // name length size 1
            buffer.write(message.command.name, 9);
            logInfo('messenger', `send #${messageId} app:reload-server ${message.command.name}`);
        }
    } else if (message.kind == 'reload-browser') {
        buffer = Buffer.alloc(7);
        buffer.write('NIRA', 0); // magic size 4
        buffer.writeUInt16LE(messageId, 4); // packet id size 2
        buffer.writeUInt8(3, 6); // kind size 1
        logInfo('messenger', `send #${messageId} reload-browser`);
    }

    ecx.connection.send(buffer);
    let timeout: any;
    const received = new Promise<BuildScriptMessageResponse>(resolve => {
        ecx.wakers[messageId] = response => {
            if (timeout) { clearTimeout(timeout); }
            if (message.kind == 'file' && response.kind == 'file') {
                response.filename = message.filename;
            } else if (message.kind == 'admin' && response.kind == 'admin') {
                response.command = message.command;
            }
            resolve(response);
        };
    });

    return await Promise.any([
        received,
        new Promise<BuildScriptMessageResponse>(resolve => {
            timeout = setTimeout(() => {
                delete ecx.wakers[messageId];
                logError('messenger', `message ${messageId} timeout`);
                resolve(null);
            }, 30_000);
        }),
    ]);
}

// upload through websocket connection eliminate the time to establish tls connection and ssh connection
// this also have centralized handling of example.com replacement
// return item is null for not ok
async function deployWithRemoteConnect(ecx: MessengerContext, assets: UploadAsset[]): Promise<BuildScriptMessageResponseUploadFile[]> {
    // compare to the not know whether can parallel sftp, this is designed to be parallel
    return await Promise.all(assets.map(async asset => {
        // webroot base path and parent path mkdir is handled in remote akari
        if (!Buffer.isBuffer(asset.data)) {
            asset.data = Buffer.from(asset.data.replaceAll('example.com', scriptconfig.domain));
        }
        const data = await new Promise<Buffer>(resolve => zstdCompress(asset.data, (error, data) => {
            if (error) {
                logError('messenger-upload', `failed to compress ${asset.remote}`, error);
                resolve(null);
            } else {
                resolve(data);
            }
        }));
        if (data) {
            return await sendRemoteMessage(ecx, { kind: 'file', filename: asset.remote, content: data });
        } else {
            return null;
        }
    }));
}
// END LIBRARY dcd201d6c076f3c9b177e63f7c697cdf9005bb8e3e5e2ca5a40504c825bec029

// in old days you need to deploy public files, if you forget
async function uploadPublicAssets() {
    logInfo('akari', chalk`deploy {cyan public}`);
    const assets = await Promise.all((await fs
        .readdir('src/public', { recursive: true, withFileTypes: true }))
        .filter(entry => entry.isFile())
        .map<Promise<UploadAsset>>(async entry => {
            const filepath = path.join(entry.parentPath, entry.name);
            // return { data: await fs.readFile(filepath), remote: filepath.replace('src/', '') };
            return { data: await fs.readFile(filepath), remote: filepath.replace('src/public/', 'public2/') };
        }));
    await deploy(assets);
    logInfo('akari', chalk`deploy {cyan public} complete`);
}

// static command was referring to home page and user page
// but now it means the pure static pages home, short, 404, 418
async function uploadStaticAssets() {
    logInfo('akari', chalk`deploy {cyan static}`);
    const assets = await Promise.all([
        ['src/static/home.html', 'static/home.html'],
        ['src/static/short.html', 'static/short.html'],
        ['src/static/404.html', 'static/404.html'],
        ['src/static/418.html', 'static/418.html'],
    ].map(async ([local, remote]) => ({ data: await fs.readFile(local), remote })));
    await deploy(assets);
    logInfo('akari', chalk`deploy {cyan static} complete`);
}

// deploy remote akari.ts
async function deployRemoteSelf() {
    logInfo('akari', chalk`deploy {cyan remote self}`);

    const adminInterfaceTypeOk = await validateSharedTypeDefinition(
        'src/shared/admin.d.ts', 'script/remote-akari.ts', 'AdminInterfaceCommand');
    if (!adminInterfaceTypeOk) { logError('akari', chalk`{cyan remote self} failed at shared type`); return; }
    
    // type check the file to avoid some potential errors
    const tcx = transpile({
        entry: 'script/remote-akari.ts',
        target: 'node',
        additionalOptions: { noEmit: true, erasableSyntaxOnly: true },
    });
    if (!tcx.success) { logError('akari', chalk`{cyan remote self} failed at type check`); return; }
    const uploadResult = await deploy([{ data: await fs.readFile('script/remote-akari.ts'), remote: 'akari.ts' }]);
    if (!uploadResult) {
        logError('akari', chalk`{cyan remote self} failed at upload`); return;
    }
    logInfo('akari', chalk`deploy {cyan remote self} completed successfully`);
}

// identity provider is the formal name for id.example.com, user.html and user.js, see authentication.md 
async function buildIdentityProvider(ecx?: MessengerContext) {
    logInfo('akari', chalk`build {cyan user page}`);

    const tcx = transpile({ entry: 'src/static/user.tsx', target: 'browser' });
    if (!tcx.success) { logError('akari', chalk`{cyan user page} failed at transpile`); return; }
    const mcx = await mypack({ entry: '/vbuild/user.js' }, tcx);
    if (!mcx.success) { logError('akari', chalk`{cyan user page} failed at pack`); return; };

    // TODO recover change from old dev machine and enable this
    // if (!await eslint({ files: 'src/static/user.tsx' })) { /* return; */ }

    const assets: UploadAsset[] = [
        // read html into string to do exmaple.com substitution
        { data: await fs.readFile('src/static/user.html', 'utf-8'), remote: 'static/user.html' },
        { data: mcx.resultJs, remote: 'static/user.js' },
    ];
    if (ecx) {
        const uploadResults = await deployWithRemoteConnect(ecx, assets);
        if (uploadResults.some(r => !r || r.status == 'error')) {
            logError('akari', chalk`{cyan user page} failed at upload`); return;
        } else if (!uploadResults.some(r => r.status == 'error')) {
            logInfo('akari', chalk`build {cyan user page} completed with no change`); return;
        } else {
            await sendRemoteMessage(ecx, { kind: 'admin', command: { kind: 'static-content:reload', key: 'user' } });
            // no response display here, see remote akari output,
            // reload static fail is kind of fail, but the final message here is build complete so ok
        }
    } else {
        const uploadResult = await deploy(assets);
        if (!uploadResult) { logError('akari', chalk`{cyan user page} failed at upload`); return false; }
    }
    
    logInfo('akari', chalk`build {cyan user page} completed successfully`); return true;
}

// // this is extremely simple comparing to the full standalone version of temp version of build-core.js
async function buildCore(ecx?: MessengerContext) {
    logInfo('akari', chalk`build {cyan core}`);

    const tcx = transpile({ entry: 'src/core/index.ts', target: 'node' });
    if (!tcx.success) { logError('akari', chalk`{cyan core} failed at transpile`); return; }
    const mcx = await mypack({ entry: '/vbuild/core/index.js' }, tcx);
    if (!mcx.success) { logError('akari', chalk`{cyan core} failed at pack`); return; }
    
    // TODO recover change from old dev machine and enable this
    // if (!await eslint({ files: 'src/core/*' })) { /* return; */ }

    const assets: UploadAsset[] = [{ data: mcx.resultJs, remote: 'index.js' }];
    if (ecx) {
        const [uploadResult] = await deployWithRemoteConnect(ecx, assets);
        if (!uploadResult || uploadResult.status == 'error') {
            logError('akari', chalk`{cyan core} failed at upload`); return;
        } else if (uploadResult.status == 'nodiff') {
            logInfo('akari', chalk`build {cyan core} completed with no change`); return;
        } // no furthur reload command for core
    } else {
        const uploadResult = await deploy(assets);
        if (!uploadResult) { logError('akari', chalk`{cyan core} failed at upload`); return false; }
    }

    logInfo('akari', chalk`build {cyan core} completed successfully`); return true;
}

async function dispatch(command: string[]) {
    if (command[0] == 'public') {
        await uploadPublicAssets();
    } else if (command[0] == "static") {
        await uploadStaticAssets();
    } else if (command[0] == 'rself') {
        // the original command for bootstraping is 'self', and the original command
        // for remote akari is self server, so keep part of the tradition to call this rself (remote self)
        await deployRemoteSelf();
    } else if (command[0] == 'user') {
        // user.html and user.tsx is currently the only ui page in this repository
        // and should be no more similar pages in future in this repository, so a dedicated command
        await buildIdentityProvider();
    } else if (command[0] == 'core') {
        await buildCore();
    } else if (command[0] == 'with' && command[1] == 'remote') {
        const ecx: MessengerContext = {
            readline: readline.createInterface({
                input: process.stdin,
                output: process.stdout,
                removeHistoryDuplicates: true,
            }),
        };
        await connectRemote(ecx);
        ecx.readline.on('SIGINT', () => process.exit(0));
        ecx.readline.prompt();
        for await (const raw of ecx.readline) {
            const line = raw.trim();
            if (line.length == 0) {
                // nothing
            } else if (line == 'exit') {
                // it's more complex to disable websocket auto reconnect
                process.exit(0);
            } else if (line.startsWith('connect')) {
                await connectRemote(ecx);
            } else if (line == 'core') {
                // TODO reuse mcx
                await buildCore(ecx);
            } else if (line == 'user') {
                await buildIdentityProvider(ecx);
            } else if (line.startsWith('upload ')) {
                // TODO upload arbitrary file
            } else { // TODO download arbitrary file?
                logError('akari', `unknown command`);
            }
            ecx.readline.prompt();
        }
    } else {
        logError('akari', 'unknown command');
    }
}

dispatch(process.argv.slice(2));
