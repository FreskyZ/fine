import * as path from 'path';
import * as chalk from 'chalk';
import { SHA256 as sha256 } from 'crypto-js';
import * as filesize from 'filesize';
import { SourceMapGenerator, SourceMapConsumer } from 'source-map';
import { minify } from 'terser';
import { logInfo, logError } from './common';

// my bundler, input list of name/content of js file/source map
// output minified js and source map

// pack .js, merge .js.map
export interface MyPackOptions {
    entry: string, // entry name should be in file list
    files: { name: string, content: string }[],
    sourceMap?: boolean, // default to false
    output?: string, // this is for display and hint in source map, will not actually write to file
    printModules?: boolean, // default to false
    minify?: boolean, // default to false
    lastResult?: MyPackResult, // previous result when watch
}

export interface MyPackResult {
    success: boolean, // others will be null if fail
    jsContent?: string,
    mapContent?: string,
    hash?: string,
    modules?: { fileName: string, moduleName: string, contentLength: number, hash: string }[],
}

// return [js content, sourcemap content, hash], js content null for failure
export async function pack(options : MyPackOptions): Promise<MyPackResult> {
    if (options.lastResult) {
        logInfo('mpk', 'repack');
    } else {
        logInfo('mpk', chalk`pack {yellow ${options.entry}}`);
    }

    if (!options.files.some(f => f.name == options.entry)) {
        logError('mpk', 'invalid entry');
        return { success: false };
    }
    const entryFolder = path.dirname(options.entry);

    const sources: { name: string, jsContent: string, mapContent: string }[] = !options.sourceMap 
        ? options.files.map(({ name, content }) => ({ name, jsContent: content, mapContent: null }))
        : options.files.filter(f => f.name.endsWith('.js')).map(({ name, content }) => ({
            name: name,
            jsContent: content,
            mapContent: options.files.find(f => f.name == name + '.map').content, // let it die if sourcemap missing
        }));
        
    let generator: SourceMapGenerator = null;
    if (options.sourceMap) {
        generator = new SourceMapGenerator({ file: options.output,  })
    }

    let lineMovement = 3; // added lines to each module, used by source map
    const resultModules: MyPackResult['modules'] = [];

    let resultJs = 
        "((modules) => { const mycache = {};\n"
        + "(function myrequire(modulename) { if (!(modulename in mycache)) { mycache[modulename] = {}; modules[modulename](mycache[modulename], myrequire); } return mycache[modulename]; })('.'); })({\n"
    for (let { name: fileName, jsContent, mapContent } of sources) {
        // myrequire module name is always path relative to entry, so entry itself is '.'
        let moduleName = path.relative(entryFolder, fileName);
        if (moduleName.endsWith('.js')) { moduleName = moduleName.slice(0, -3); }
        if (moduleName.endsWith('index')) { moduleName = moduleName.slice(0, -5); }
        if (moduleName.length == 0) { moduleName = '.'; } // entry will be empty string after previous operations
    
        // processes replace all "require('."
        let moduleContent = jsContent;
        while (true) {
            const pattern = /require\("(?<moduleName>\.[\.\w\-\/]*)"\);/;
            const match = pattern.exec(moduleContent);
            if (!match) {
                break;
            }

            // this require name may have .js, may miss index
            // so more options are searched
            const requiredName = path.join(path.dirname(fileName), match.groups['moduleName']);
            let requiredModuleName = 
                sources.some(s => s.name == requiredName) ? requiredName
                : sources.some(s => s.name == requiredName + '.js') ? requiredName + '.js'
                : sources.some(s => s.name == requiredName + '/index.js') ? requiredName + '/index.js' 
                : null;
            if (requiredModuleName === null) {
                logError('mpk', `invalid module name ${match.groups['moduleName']} at ${match.index}`);
                return { success: false };
            }

            // similar to previous moduleName
            requiredModuleName = path.relative(entryFolder, requiredModuleName);
            requiredModuleName = requiredModuleName.slice(0, -3); // required module name is name in sources list, so it must end with .js
            if (requiredModuleName.endsWith('index')) { requiredModuleName = requiredModuleName.slice(0, -5); }
            if (requiredModuleName.length == 0) { requiredModuleName = '.'; } // entry

            moduleContent = moduleContent.replace(pattern, `__myrequire__("${requiredModuleName}");`); // if replace by `myrequire("${}")`, it will be found again
        }

        resultJs += `'${moduleName}': (exports, __myrequire__) => {\n${moduleContent}}, `;
        resultModules.push({ fileName, moduleName, contentLength: moduleContent.length, hash: sha256(moduleContent).toString() });

        if (options.sourceMap) {            
            let firstMappingLine: number = null; // first mapping line is 3/4 (diff by whether have export) which maps to packed js line `lineMovement + 1`
            const consumer = await new SourceMapConsumer(JSON.parse(mapContent));
            consumer.eachMapping(mapping => {
                if (firstMappingLine === null) {
                    firstMappingLine = mapping.generatedLine;
                }

                generator.addMapping({ 
                    source: path.resolve(mapping.source), 
                    original: { line: mapping.originalLine, column: mapping.originalColumn },
                    generated: { line: mapping.generatedLine - firstMappingLine + lineMovement + 1, column: mapping.generatedColumn },
                });
            });
        }
        lineMovement += moduleContent.split('\n').length;
    }
    resultJs += '})\n';

    if (options.minify) {
        const minifyResult = await minify(resultJs);
        resultJs = minifyResult.code;
    }

    const hash = sha256(resultJs).toString();
    if (hash === options.lastResult?.hash) {
        logInfo('mpk', 'completed with no change');
    } else {
        if (!options.lastResult) {
            logInfo('mpk', 'completed with no error');
            if (options.output) { logInfo('mpk', chalk`asset {yellow ${options.output}}`); }
            logInfo('mpk', chalk`asset size {gray ${filesize(resultJs.length)}} compression rate {gray ${(resultJs.length / sources.reduce<number>((acc, s) => acc + s.jsContent.length, 0) * 100).toFixed(2)}%}`);
        }
        if (options.printModules) {
            if (options.lastResult) {
                for (const addedModule of resultModules.filter(n => !options.lastResult.modules.some(p => p.fileName == n.fileName))) {
                    console.log(chalk`  {gray +} ${addedModule.fileName} {cyan ${addedModule.moduleName}} {gray size ${filesize(addedModule.contentLength)}}`);
                }
                for (const [updatedModule] of resultModules
                    .map(n => [n, options.lastResult.modules.find(p => p.fileName == n.fileName)])
                    .filter(([currentModule, previousModule]) => previousModule && currentModule.hash != previousModule.hash)) {
                    console.log(chalk`  {gray *} ${updatedModule.fileName} {cyan ${updatedModule.moduleName}} {gray size ${filesize(updatedModule.contentLength)}}`);
                }
                for (const removedModule of options.lastResult.modules.filter(p => !resultModules.some(n => n.fileName == p.fileName))) {
                    console.log(chalk`  {gray - removed ${removedModule.fileName}} {cyan ${removedModule.moduleName}}`);
                }
            } else {
                for (const { fileName, moduleName, contentLength } of resultModules) {
                    console.log(chalk`   {gray +} ${fileName} {cyan ${moduleName}} {gray size ${filesize(contentLength)}}`);
                }
            }
        }
    }

    return { success: true, jsContent: resultJs, mapContent: generator?.toString(), hash: hash, modules: resultModules };
}
