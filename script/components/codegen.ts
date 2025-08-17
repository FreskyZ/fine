import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import chalk from 'chalk-template';
import { XMLParser } from 'fast-xml-parser';
import { logInfo, logError } from './common.ts';

interface DatabaseModelField {
    name: string,
    type: 'id' | 'int' | 'string' | 'datetime' | 'guid' | 'text',
    nullable: boolean,
    size: number, // string size
}
interface DatabaseModelForeignKey {
    table: string, // foreign table
    field: string,
}
interface DatabaseModelTable {
    name: string,
    primaryKey: string[], // primary key field name, pk is required for now
    foreignKeys: DatabaseModelForeignKey[],
    fields: DatabaseModelField[],
}

interface WebInterfaceActionParameter {
    name: string,
    type: 'id' | 'guid', // for now only this
    optional: boolean,
}
interface WebInterfaceAction {
    // finally you need something to group actions
    // for now =main is main, =share is for share page
    // for now =temp is temporary investigating actions
    key: string,
    name: string,
    public: boolean,
    // method is not in config but comes from name
    // GetXXX => GET, AddXXX => PUT, RemoveXXX => DELETE, other => POST
    method: string,
    // path is not in config but comes from name
    // for GetXXX, remove the Get prefix, remaining part change from camel case to snake case
    path: string,
    parameters: WebInterfaceActionParameter[],
    body?: string, // body type name
    return?: string, // return type name
}
interface WebInterfaceActionTypeField {
    name: string,
    // primitive type or custom type
    type: 'id' | 'int' | 'string' | 'datetime' | string,
    nullable: boolean,
}
interface WebInterfaceActionType {
    name: string,
    fields: WebInterfaceActionTypeField[],
}

interface CodeGenerationConfig {
    options: CodeGenerationOptions,
    dbname: string,
    tables: DatabaseModelTable[],
    appname: string,
    actions: WebInterfaceAction[],
    actionTypes: WebInterfaceActionType[],
}

// currently input files are at fixed path
// return null for read error
export async function readCodeGenerationConfig(options: CodeGenerationOptions): Promise<CodeGenerationConfig> {
    let hasError = false;

    const parser = new XMLParser({
        preserveOrder: true,
        ignoreAttributes: false,
        attributeNamePrefix: '',
        parseAttributeValue: true,
    });
    // the result of preserveOrder is too complex and not that worthy to type
    const rawShapes = parser.parse(await fs.readFile('shapes.xml'));
    // console.log(JSON.stringify(rawShapes, undefined, 2));

    const appname = rawShapes[1][':@'].app;
    const dbname = rawShapes[1][':@'].database;

    const tables: DatabaseModelTable[] = [];
    const actions: WebInterfaceAction[] = [];
    const actionTypes: WebInterfaceActionType[] = [];
    rawShapes[1].shapes.forEach((c: any) => {
        if ('table' in c) {
            tables.push({
                name: c[':@'].name,
                primaryKey: c.table.find((f: any) => 'primary-key' in f)[':@'].field.split(','),
                foreignKeys: c.table.filter((f: any) => 'foreign-key' in f).map((f: any) => f[':@']),
                fields: c.table.filter((f: any) => 'field' in f).map((f: any) => ({
                    name: f[':@'].name,
                    type: f[':@'].type.endsWith('?') ? f[':@'].type.substring(0, f[':@'].type.length - 1) : f[':@'].type,
                    nullable: f[':@'].type.endsWith('?'),
                    size: f[':@'].size ? parseInt(f[':@'].size) : null,
                })),
            });
        } else if ('type' in c) {
            actionTypes.push({
                name: c[':@'].name,
                fields: c.type.map((f: any) => ({
                    name: f[':@'].name,
                    type: f[':@'].type.endsWith('?') ? f[':@'].type.substring(0, f[':@'].type.length - 1) : f[':@'].type,
                    nullable: f[':@'].type.endsWith('?'),
                })),
            });
        } else if ('action' in c) {
            const key = c[':@'].key;
            const name = c[':@'].name;
            const $public = !!c[':@'].public;
            const nameWithoutPublic = $public ? name.substring(6) : name;
            const method = nameWithoutPublic.startsWith('Get') ? 'GET'
                : nameWithoutPublic.startsWith('Add') ? 'PUT'
                : nameWithoutPublic.startsWith('Remove') ? 'DELETE' : 'POST';
            const nameWithoutGet = nameWithoutPublic.startsWith('Get') ? nameWithoutPublic.substring(3) : nameWithoutPublic;
            const path = nameWithoutGet.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
            const body = c[':@'].body;
            const $return = c[':@'].return;
            const parameters = [1, 2, 3, 4].map(i => c[':@'][`a${i}`]).filter(x => x).map(r => {
                // NOTE for now only support these
                if (r.includes(':')) {
                    const name = r.substring(0, r.indexOf(':'));
                    const type = r.substring(r.indexOf(':') + 1);
                    return { name, type, optional: false };
                } else {
                    return { name: r, type: 'id', optional: false };
                }
            });
            actions.push({ key, name, public: $public, method, path, body, return: $return, parameters });
        // ? you cannot get tag name in preserveOrder?
        } else if (!('----------------------------------------------' in c)) {
            hasError = true;
            logError('codegen', 'database.xml: unknown element tag, expect table/type/action');
        }
    });
    // console.log(tables, JSON.stringify(actionTypes, undefined, 2), actions);

    return hasError ? null : { options, dbname, tables, appname, actions, actionTypes };
}

// database.d.ts, return null for not ok
function generateDatabaseTypes(config: CodeGenerationConfig): string {
    let sb = '';
    sb += '// --------------------------------------\n';
    sb += '// ------ ATTENTION AUTO GENERATED ------\n';
    sb += '// --------------------------------------\n';
    sb += '\n';
    sb += `import type { Dayjs } from 'dayjs';\n`;
    sb += '\n';
    for (const table of config.tables) {
        sb += `export interface ${table.name} {\n`;
        for (const field of table.fields) {
            const type = {
                'id': 'number',
                'int': 'number',
                'datetime': 'Dayjs',
                'guid': 'string',
                'text': 'string',
                'string': 'string',
                'bool': 'boolean',
            }[field.type];
            sb += `    ${field.name}${field.nullable ? '?' : ''}: ${type},\n`;
        }
        sb += `    CreateTime: Dayjs,\n`;
        sb += `    UpdateTime: Dayjs,\n`;
        sb += `}\n`;
    }
    return sb;
}
// database.sql, return null for not ok
function generateDatabaseSchema(config: CodeGenerationConfig): string {
    let hasError = false;

    let sb = '';
    sb += '--------------------------------------\n';
    sb += '------ ATTENTION AUTO GENERATED ------\n';
    sb += '--------------------------------------\n';
    sb += '\n';
    sb += '-- -- first, mysql -u root -p:\n';
    sb += `-- CREATE DATABASE \`${config.dbname}\`;\n`;
    sb += `-- GRANT ALL PRIVILEGES ON \`${config.dbname}\`.* TO 'fine'@'localhost';\n`;
    sb += '-- FLUSH PRIVILEGES;\n';
    sb += '-- -- then, mysql -p\n';
    sb += '\n';
    for (const table of config.tables) {
        sb += `CREATE TABLE \`${table.name}\` (\n`;
        for (const field of table.fields) {
            const type = {
                'id': 'INT',
                'int': 'INT',
                'datetime': 'DATETIME',
                'guid': 'VARCHAR(36)',
                'text': 'TEXT',
                'string': `VARCHAR(${field.size})`,
                'bool': 'BIT',
            }[field.type];
            const autoIncrement = table.primaryKey.length == 1 && table.primaryKey[0] == field.name && field.type == 'id' ? ' AUTO_INCREMENT' : '';
            const newGuid = table.primaryKey.length == 1 && table.primaryKey[0] == field.name && field.type == 'guid' ? ' DEFAULT (UUID())' : '';
            sb += `    \`${field.name}\` ${type} ${field.nullable ? 'NULL' : 'NOT NULL'}${autoIncrement}${newGuid},\n`;
        }
        sb += '    `CreateTime` DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP),\n';
        sb += '    `UpdateTime` DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP),\n';
        sb += `    CONSTRAINT \`PK_${table.name}\` PRIMARY KEY (${table.primaryKey.map(k => `\`${k}\``).join(',')}),\n`;
        for (const fk of table.foreignKeys) {
            const foreignTable = config.tables.find(t => t.name == fk.table);
            if (foreignTable.primaryKey.length > 1) {
                hasError = true;
                logError('codegen', `table ${table.name} foreign key ${fk.field} cannot reference table ${fk.table} with composite primary key`);
            }
            const foreignTablePrimaryKey = foreignTable.primaryKey[0];
            sb += `    CONSTRAINT \`FK_${table.name}_${fk.table}\``;
            sb += ` FOREIGN KEY (\`${fk.field}\`) REFERENCES \`${fk.table}\`(\`${foreignTablePrimaryKey}\`),\n`;
        }
        sb = sb.substring(0, sb.length - 2) + '\n';
        sb += `);\n`;
    }
    return hasError ? null : sb;
}
// api.d.ts, return null for not ok
function generateWebInterfaceTypes(config: CodeGenerationConfig): string {

    let sb = '';
    sb += '// --------------------------------------\n';
    sb += '// ------ ATTENTION AUTO GENERATED ------\n';
    sb += '// --------------------------------------\n';
    sb += '\n';
    for (const type of config.actionTypes) {
        sb += `export interface ${type.name} {\n`;
        for (const field of type.fields) {
            const type = {
                'id': 'number',
                'int': 'number',
                'datetime': 'string',
                'string': 'string',
                'bool': 'boolean',
            }[field.type] ?? field.type;
            sb += `    ${field.name}${field.nullable ? '?' : ''}: ${type},\n`;
        }
        sb += '}\n';
    }
    return sb;
}

// return original manual content (content before mark), return null for have error
function checkPartialGeneratedContentHash(config: CodeGenerationConfig, taskName: string, originalContent: string): string {
    const markIndex = originalContent.indexOf('// AUTOGEN');
    const markEndIndex = originalContent.indexOf('\n', markIndex);
    const expectHash = originalContent.substring(markIndex + 11, markEndIndex);
    const actualHash = crypto.hash('sha256', originalContent.substring(markEndIndex + 1));
    if (expectHash != actualHash) {
        const expectShortHash = expectHash.substring(0, 6);
        const actualShortHash = actualHash.substring(0, 6);
        if (actualShortHash != expectShortHash) {
            logError('codegen', `${taskName}: hash mismatch expect ${expectShortHash} actual ${actualShortHash}`);
        } else {
            logError('codegen', `${taskName}: hash mismatch expect ${expectHash} actual ${actualHash}`);
        }
        if (!config.options.ignoreHashMismatch) {
            logError('codegen', `${taskName}: generated content seems unexpectedly changed, use ignorehash to ignore and overwrite`);
            return null;
        }
    }
    return originalContent.substring(0, markIndex);
}

// index.ts, return null for not ok
function generateWebInterfaceServer(config: CodeGenerationConfig, originalContent: string): string {

    const manualContent = checkPartialGeneratedContentHash(config, 'actions-server', originalContent);
    if (!manualContent) { return null; }
    let sb = '';
    sb += '// --------------------------------------\n';
    sb += '// ------ ATTENTION AUTO GENERATED ------\n';
    sb += '// --------------------------------------\n';
    sb += '\n';
    sb += 'export async function dispatch(ctx: ActionServerRequest): Promise<ActionServerResponse> {\n';
    // NOTE no need to wrap try in this function because it correctly throws into overall request error handler
    sb += `    const { pathname, searchParams } = new URL(ctx.path, 'https://example.com');\n`;
    sb += `    const v = new ParameterValidator(searchParams);\n`;
    sb += `    const ax: ActionContext = { now: ctx.state.now, userId: ctx.state.user?.id, userName: ctx.state.user?.name };\n`;
    sb += `    const action = ({\n`;
    for (const action of config.actions) {
        const functionName = action.name.charAt(0).toLowerCase() + action.name.substring(1);
        sb += `        '${action.method} ${action.public ? '/public' : ''}/v1/${action.path}': () => ${functionName}(ax, `;
        for (const parameter of action.parameters) {
            const optional = parameter.name.endsWith('?');
            const parameterName = optional ? parameter.name.substring(0, parameter.name.length - 1) : parameter.name;
            const method = parameter.type == 'id' ? 'id' : 'string';
            sb += `v.${method}${optional ? 'opt' : ''}('${parameterName}'), `;
        }
        if (action.body) {
            sb += 'ctx.body, ';
        }
        sb = sb.substring(0, sb.length - 2) + '),\n';
    }
    sb += `    } as Record<string, () => Promise<any>>)[\`\${ctx.method} \${pathname}\`];\n`;
    sb += `    return action ? { body: await action() } : { error: new MyError('not-found', 'action not found') };\n`;
    sb += `}\n`;

    const hash = crypto.hash('sha256', sb);
    return `${manualContent}// AUTOGEN ${hash}\n${sb}`;
}
// index.tsx, return null for not ok
function generateWebInterfaceClient(config: CodeGenerationConfig, originalContent: string): string {

    const manualContent = checkPartialGeneratedContentHash(config, 'actions-client', originalContent);
    if (!manualContent) { return null; }
    let sb = '';
    sb += '// --------------------------------------\n';
    sb += '// ------ ATTENTION AUTO GENERATED ------\n';
    sb += '// --------------------------------------\n';

    // NOTE this is hardcode replaced in make-akari.ts
    sb += `template-client.tsx`.replaceAll('api.example.com/example', `api.example.com/${config.appname}`);

    sb += 'const api = {\n';
    // for now now action.key only used here
    for (const action of config.actions.filter(a => a.key == 'main')) {
        const functionName = action.name.charAt(0).toLowerCase() + action.name.substring(1);
        sb += `    ${functionName}: (`;
        for (const parameter of action.parameters) {
            const optional = parameter.name.endsWith('?');
            const parameterName = optional ? parameter.name.substring(0, parameter.name.length - 1) : parameter.name;
            const type = parameter.type == 'id' ? 'number' : 'string';
            // use `T | undefined` for optional parameter, or else notnullable body cannot be after optional parameter
            sb += `${parameterName}: ${type}${optional ? ' | undefined' : ''}, `;
        }
        if (action.body) {
            sb += `data: I.${action.body}, `;
        }
        if (sb.endsWith(', ')) {
            sb = sb.substring(0, sb.length - 2);
        }
        sb += `): Promise<${action.return ? `I.${action.return}` : 'void'}> => `;

        sb += `sendRequest('${action.method}', '${action.public ? '/public' : ''}/v1/${action.path}', `;
        if (action.parameters.length) {
            sb += `{ `;
            for (const parameter of action.parameters) {
                const optional = parameter.name.endsWith('?');
                const parameterName = optional ? parameter.name.substring(0, parameter.name.length - 1) : parameter.name;
                sb += `${parameterName}, `;
            }
            sb = sb.substring(0, sb.length - 2);
            sb += ` }, `;
        } else if (action.body) {
            sb += `{}, `;
        }
        if (action.body) {
            sb += `data, `;
        }
        sb = sb.substring(0, sb.length - 2) + '),\n';
    }
    sb += '};\n';

    const hash = crypto.hash('sha256', sb);
    return `${manualContent}// AUTOGEN ${hash}\n${sb}`;
}

interface CodeGenerationOptions {
    emit: boolean, // actually write file
    client: boolean, // include client side targets
    server: boolean, // include server side targets
    ignoreHashMismatch: boolean,
}
// return true for ok, false for not ok
export async function generateCode(config: CodeGenerationConfig): Promise<boolean> {
    logInfo('codegen', 'code generation');
    let hasError = false;

    const createTask = (path: string, generate: (config: CodeGenerationConfig) => string) => async () => {
        const generatedContent = generate(config);
        if (!generatedContent) {
            hasError = true;
        }
        if (config.options.emit && generatedContent) {
            // write file may throw error, but actually you don't need to care about that
            logInfo('codegen', chalk`write {yellow ${path}}`);
            await fs.writeFile(path, generatedContent);
        }
    };
    const createPartialTask = (path: string, generate: (config: CodeGenerationConfig, originalContent: string) => string) => async () => {
        const originalContent = await fs.readFile(path, 'utf-8');
        const generatedContent = generate(config, originalContent);
        if (!generatedContent) {
            hasError = true;
        }
        if (config.options.emit && generatedContent) {
            // write file may throw error, but actually you don't need to care about that
            logInfo('codegen', chalk`write {yellow ${path}}`);
            await fs.writeFile(path, generatedContent);
        }
    };

    const tasks = [
        { kind: 'server', name: 'database-types.d.ts', run: createTask('src/server/database-types.d.ts', generateDatabaseTypes) },
        { kind: 'server', name: 'database.sql', run: createTask('src/database.sql', generateDatabaseSchema) },
        { kind: 'client,server', name: 'api.d.ts', run: createTask('src/shared/api-types.d.ts', generateWebInterfaceTypes) },
        { kind: 'server', name: 'index.ts', run: createPartialTask('src/server/index.ts', generateWebInterfaceServer) },
        { kind: 'client', name: 'index.tsx', run: createPartialTask('src/client/index.tsx', generateWebInterfaceClient) },
    ].filter(t => (config.options.client && t.kind.includes('client')) || (config.options.server && t.kind.includes('server')));
    // console.log('scheduled tasks', tasks);
    await Promise.all(tasks.map(t => t.run()));

    if (hasError) { logError('codegen', 'code generation completed with error'); } else { logInfo('codegen', 'code generation complete'); }
    return !hasError;
}
