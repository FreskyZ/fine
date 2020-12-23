import { promises as fs } from 'fs';
import * as chalk from 'chalk';
import { toJson as parseXml } from 'xml2json';
import { logInfo, logError } from '../common';

type PathComponent = {
    type: 'normal',
    value: string,
} | {
    type: 'parameter',
    parameterName: string,
    parameterType: string,
}

interface APIDefinition {
    namespace?: string,
    apiName: string, 
    method: string, 
    apiPath: PathComponent[],
    bodyType: string,
    bodyName: string,
    returnType: string,
}

interface APIDefinitionFile {
    version: string,
    definitions: APIDefinition[],
}

const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const myfetchMethods: { [method: string]: string } = { 'GET': 'get', 'POST': 'post', 'PUT': 'put', 'PATCH': 'patch', 'DELETE': 'del' }; // to lower and DELETE to del

const parameterTypes = ['id', 'number', 'string', 'boolean', 'date', 'time'];
const parameterTypeConfig: { [parameterType: string]: { pattern: string, validator: string, tsType: string } }= {
    'id': { pattern: '\\d+', validator: 'validateId', tsType: 'number' },
    'number': { pattern: '\\d+', validator: 'validateNumber', tsType: 'number' },
    'string': { pattern: '.+', validator: 'validateString', tsType: 'string' },
    'boolean': { pattern: '(true|false)', validator: 'validateBoolean', tsType: 'boolean' },
    'date': { pattern: '\\d{6}', validator: 'validateDate', tsType: 'Dayjs' },  // generated code format date at front end, validate and parse date at backend
    'time': { pattern: '\\d{12}', validator: 'validateTime', tsType: 'Dayjs' }, // generated code format time at front end, validate and parse time at backend
}

function parsePath(apiName: string, rawPath: string): PathComponent[] {
    const result: PathComponent[] = [];
    
    do {
        const match = /\{(?<parameterName>[\w\_]+):(?<parameterType>\w+)\}/.exec(rawPath);
        if (!match) { break; }

        if (result.filter(r => r.type == 'parameter').length == 10) {
            // this is actually prevent infinite loop while developing
            throw new Error(`api ${apiName} too many parameters`);
        }

        const [parameterName, parameterType] = [match.groups['parameterName'], match.groups['parameterType']];
        if (!parameterTypes.includes(parameterType)) {
            throw new Error(`api ${apiName} parameter ${parameterName} invalid type ${parameterType}`);
        }

        if (match.index != 0) {
            result.push({ type: 'normal', value: rawPath.slice(0, match.index) });
        }
        result.push({ type: 'parameter', parameterName, parameterType });

        rawPath = rawPath.slice(match.index + parameterName.length + parameterType.length + 3); // because regex cannot match from index, so have to slice it
    } while (true);

    if (rawPath.length) {
        result.push({ type: 'normal', value: rawPath });
    }

    return result;
}

async function loadFile(app: string): Promise<APIDefinitionFile> {
    const xml = await fs.readFile(`src/${app}/api.xml`, 'utf-8');
    const { version, api } = parseXml(xml, { object: true })[`${app}-api`] as { version: string, api: any[] };

    return {
        version, 
        definitions: api.map<APIDefinition>((d, index) => {

            const apiName = d['name'];
            if (!apiName) {
                throw new Error(`index ${index} api name is required`);
            }

            const method = d['method'];
            if (!methods.includes(method)) {
                throw new Error(`api ${apiName} invalid method`);
            }

            const rawPath = d['path'] as string;
            if (!rawPath) {
                throw new Error(`api ${apiName} path is required`);
            }
            if (!rawPath.startsWith('/')) {
                throw new Error(`api ${apiName} path should be absolute`);
            }
            const parsedPath = parsePath(apiName, rawPath);

            const [bodyType, bodyName] = [d['body-type'], d['body-name']];
            if (['POST', 'PUT', 'PATCH'].includes(method) && (!bodyType || !bodyName)) {
                throw new Error(`api ${apiName} body is required for ${method}`);
            }

            return {
                namespace: d['namespace'] || 'default',
                apiName: apiName,
                method: method,
                apiPath: parsedPath,
                bodyType: bodyType,
                bodyName: bodyName,
                returnType: d['return-type'] || 'void',
            };
        }),
    };
}

// return true for success (emitted)
async function generateServerDefinition(app: string): Promise<boolean> {
    const filename = `src/${app}/server/index.ts`;
    logInfo('fcg', chalk`generate {yellow ${filename}}`);

    let definitionFile: APIDefinitionFile;
    try {
        definitionFile = await loadFile(app);
    } catch (ex) {
        logError('fcg', ex.message);
        return false;
    }
    const { version, definitions } = definitionFile;

    let resultJs = '// ATTENTION:\n'
        + '// This code was generated by a tool.\n'
        + '// Changes to this file may cause incorrect behavior and will be lost if the code is regenerated.\n\n';
    if (definitions.length == 0) {
        resultJs += "// empty\n";
        await fs.writeFile(filename, resultJs);
        logInfo('fcg', 'generate completed with empty');
        return true;
    }

    // because colon is only used for capture type, so validators can be prepared by this
    const validators: string[] = parameterTypes
        .filter(parameterType => definitions.some(d => d.apiPath.some(c => c.type == 'parameter' && c.parameterType == parameterType)))
        .map(parameterType => parameterTypeConfig[parameterType].validator)
        .concat(definitions.some(d => ['PUT', 'POST', 'PATCH'].includes(d.method)) ? ['validateBody'] : []);
    resultJs += `import { WebContext, ${validators.join(', ')} } from '../../shared/api-server';\n`;

    resultJs += `import { MyError } from '../../shared/error';\n`;

    for (const namespace of definitions.map(d => d.namespace).filter((n, index, array) => array.indexOf(n) == index)) {
        resultJs += `import { ${definitions.filter(d => d.namespace == namespace).map(d => d.apiName).join(', ')} } from './${namespace}';\n`;
    }

    resultJs += '\n';
    resultJs += `export async function dispatch(ctx: WebContext) {\n`;
    resultJs += `    let match: RegExpExecArray;\n`;
    resultJs += `    if (!ctx.path.startsWith('/${app}/v${version}')) { throw new MyError('not-found', 'invalid invocation version'); }\n`
    resultJs += `    const methodPath = \`\${ctx.method} \${ctx.path.slice(${app.length + version.length + 3})}\`;\n`; // 3: /{app}/v{version}
    resultJs += '\n';

    for (const definition of definitions) {
        const { apiName, method, apiPath, bodyType, returnType } = definition;

        resultJs += `    match = /^${method} `;
        for (const component of apiPath) {
            if (component.type == 'normal') {
                resultJs += component.value.replaceAll('/', '\\/');
            } else {
                resultJs += `(?<${component.parameterName}>${parameterTypeConfig[component.parameterType].pattern})`
            }
        }
        resultJs += `$/.exec(methodPath); if (match) {\n`;

        resultJs += '        ';
        if (returnType && returnType != 'void') {
            resultJs += `ctx.body = `;
        }
        resultJs += `await ${apiName}(ctx.state`;
        for (const { parameterName, parameterType } of apiPath.filter(c => c.type == 'parameter') as { parameterName: string, parameterType: string }[]) { // tsc fails to infer the type
            resultJs += `, ${parameterTypeConfig[parameterType].validator}('${parameterName}', match.groups['${parameterName}'])`;
        }
        if (bodyType) {
            resultJs += `, validateBody(ctx.request.body)`;
        }
        resultJs += ');\n';

        if (method == 'POST') {
            resultJs += `        ctx.status = 201;\n`;
        } else if (method == 'DELETE') {
            resultJs += `        ctx.status = 204;\n`;
        }

        resultJs += `        return;\n`;
        resultJs += `    }\n`;
    }

    resultJs += `\n`;
    resultJs += `    throw new MyError('not-found', 'invalid invocation');\n`;
    resultJs += '}\n';

    await fs.writeFile(filename, resultJs);
    logInfo('fcg', 'generate completed');
    return true;
}

async function generateClientDefinition(app: string): Promise<boolean> {
    const filename = `src/${app}/client/api.ts`;
    logInfo('fcg', chalk`generate {yellow ${filename}}`);

    let definitionFile: APIDefinitionFile;
    try {
        definitionFile = await loadFile(app);
    } catch (ex) {
        logError('fcg', ex.message);
        return false;
    }
    const { version, definitions } = definitionFile;

    let resultJs = '// ATTENTION:\n'
        + '// This code was generated by a tool.\n'
        + '// Changes to this file may cause incorrect behavior and will be lost if the code is regenerated.\n\n';
    if (definitions.length == 0) {
        resultJs += "// empty\n";
        await fs.writeFile(filename, resultJs);
        logInfo('fcg', 'generate completed with empty');
        return true;
    }

    if (definitions.some(d => d.apiPath.some(c => c.type == 'parameter' && ['date', 'time'].includes(c.parameterType)))) {
        resultJs += `import type { Dayjs } from 'dayjs';\n`;
    }
    
    const usedMethods = methods.filter(m => definitions.some(d => d.method == m)).map(m => myfetchMethods[m]); // use all methods.filter to keep them in order
    resultJs += `import { ${usedMethods.join(', ')} } from '../../shared/api-client';\n`;

    const bodyTypes = definitions.filter(d => !!d.bodyType).map(d => d.bodyType).filter((t, index, array) => array.indexOf(t) == index);
    resultJs += `import type { ${bodyTypes.join(',')} } from '../api';\n`;

    resultJs += '\n';
    for (const definition of definitions) {
        const { apiName, method, apiPath, bodyType, bodyName, returnType } = definition;

        resultJs += `export const ${apiName} = (`;

        for (const { parameterName, parameterType } of apiPath.filter(c => c.type == 'parameter') as { parameterName: string, parameterType: string }[]) { // tsc fails to infer the type
            if (!resultJs.endsWith('(')) {
                resultJs += ', ' // do not add comma for first parameter
            }
            resultJs += `${parameterName}: ${parameterTypeConfig[parameterType].tsType}`;
        }
        if (bodyType) {
            if (!resultJs.endsWith('(')) {
                resultJs += ', ' // do not add comma for first parameter
            }
            resultJs += `${bodyName}: ${bodyType}`;
        }

        resultJs += `): Promise<${returnType}> => ${myfetchMethods[method]}(\`/${app}/v${version}`;

        for (const component of apiPath) {
            if (component.type == 'normal') {
                resultJs += component.value;
            } else {
                if (component.parameterType == 'date') {
                    resultJs += `\${${component.parameterName}.format('YYYYMMDD')}`;
                } else if (component.parameterType == 'time') {
                    resultJs += `\${${component.parameterName}.format('YYYYMMDDHHmmdd')}`;
                } else {
                    resultJs += `\${${component.parameterName}}`;
                }
            }
        }
        resultJs += '`';

        if (bodyType) {
            resultJs += `, ${bodyName}`;
        }

        resultJs += `);\n`;
    }

    await fs.writeFile(filename, resultJs);
    logInfo('fcg', 'generate completed');
    return true;
}

export async function generate(app: string, target: 'server' | 'client'): Promise<boolean> {
    if (target == 'server') {
        return await generateServerDefinition(app);
    } else {
        return await generateClientDefinition(app);
    }
}
