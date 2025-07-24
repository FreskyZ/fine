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
interface WebInterfaceAction{
    // finally you need something to group actions
    // for now =main is main, =share is for share page
    // for now =temp is temporary investigating actions
    key: string,
    name: String,
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
    dbname: string,
    tables: DatabaseModelTable[],
    appname: string,
    actions: WebInterfaceAction[],
    actionTypes: WebInterfaceActionType[],
}

// currently input files are at fixed path
// return null for read error, currently no expected error
export async function readCodeGenerationConfig(): Promise<CodeGenerationConfig> {

    const parser = new XMLParser({
        preserveOrder: true,
        ignoreAttributes: false,
        attributeNamePrefix: '',
        parseAttributeValue: true,
    });
    // the result of preserveOrder: boolean is too complex and not that worthy to type
    const rawDatabaseModel = parser.parse(await fs.readFile('src/server/database.xml'));
    // console.log(JSON.stringify(rawDatabaseModel, undefined, 2));

    const databaseName = rawDatabaseModel[1][':@'].name;
    const databaseTables = (rawDatabaseModel[1].database as any[]).map<DatabaseModelTable>(c => ({
        name: c[':@'].name,
        primaryKey: c.table.find((f: any) => 'primary-key' in f)[':@'].field.split(','),
        foreignKeys: c.table.filter((f: any) => 'foreign-key' in f).map((f: any) => f[':@']),
        fields: c.table.filter((f: any) => 'field' in f).map((f: any) => ({
            name: f[':@'].name,
            type: f[':@'].type.endsWith('?') ? f[':@'].type.substring(0, f[':@'].type.length - 1) : f[':@'].type,
            nullable: f[':@'].type.endsWith('?'),
            size: f[':@'].size ? parseInt(f[':@'].size) : null,
        })),
    }));
    // console.log(JSON.stringify(databaseModel, undefined, 2));

    const rawWebInterfaces = parser.parse(await fs.readFile('src/shared/api.xml'));
    // console.log(JSON.stringify(rawWebInterfaces, undefined, 2));

    const actions: WebInterfaceAction[] = [];
    const actionTypes: WebInterfaceActionType[] = [];
    const applicationName = rawWebInterfaces[1][':@'].name;
    rawWebInterfaces[1].api.forEach((c: any) => {
        if ('type' in c) {
            actionTypes.push({
                name: c[':@'].name,
                fields: c.type.map((f: any) => ({
                    name: f[':@'].name,
                    type: f[':@'].type.endsWith('?') ? f[':@'].type.substring(0, f[':@'].type.length - 1) : f[':@'].type,
                    nullable: f[':@'].type.endsWith('?'),
                })),
            });
        } else {
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
        }
    });
    // console.log(JSON.stringify(actionTypes, undefined, 2), actions);

    return { dbname: databaseName, tables: databaseTables, appname: applicationName, actions, actionTypes };
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
            sb += `    ${field.name}${field.nullable ? '?' : ''}: ${type},\n`
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
    sb += '-- -- first, mysql -u root -p:\n'
    sb += `-- CREATE DATABASE '${config.dbname}';\n`;
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
            }[field.type] ?? field.type;
            sb += `    ${field.name}${field.nullable ? '?': ''}: ${type},\n`;
        }
        sb += '}\n';
    }
    return sb;
}
// index.ts, return null for not ok
function generateWebInterfaceServer(config: CodeGenerationConfig, originalContent: string): string {

    let sb = originalContent;
    sb = sb.substring(0, sb.indexOf('// AUTOGEN'));
    sb += '// AUTOGEN\n';
    sb += '// --------------------------------------\n';
    sb += '// ------ ATTENTION AUTO GENERATED ------\n';
    sb += '// --------------------------------------\n';
    sb += '\n'
    sb += `class MyError extends Error {
    // fine error middleware need this to know this is known error type
    public readonly name: string = 'FineError';
    public constructor(public readonly kind: MyErrorKind, message?: string) { super(message); }
}\n`;
    sb += `class ParameterValidator {
    public constructor(private readonly parameters: URLSearchParams) {}
    private validate<T>(name: string, optional: boolean, convert: (raw: string) => T, validate: (value: T) => boolean): T {
        if (!this.parameters.has(name)) {
            if (optional) { return null; } else { throw new MyError('common', \`missing required parameter \${name}\`); }
        }
        const raw = this.parameters.get(name);
        const result = convert(raw);
        if (validate(result)) { return result; } else { throw new MyError('common', \`invalid parameter \${name} value \${raw}\`); }
    }
    public id(name: string) { return this.validate(name, false, parseInt, v => !isNaN(v) && v > 0); }
    public string(name: string) { return this.validate(name, false, v => v, v => !!v); }
}\n`;
    // append more helper methods if need
    // public idopt(name: string) { return this.validate(name, true, parseInt, v => !isNaN(v) && v > 0); }

    sb += 'export async function dispatch(ctx: DispatchContext): Promise<DispatchResult> {\n';
    // NOTE no need to wrap try in this function because it correctly throws into overall request error handler
    sb += `    const { pathname, searchParams } = new URL(ctx.path, 'https://example.com');\n`;
    sb += `    const v = new ParameterValidator(searchParams);\n`
    sb += `    const ax: ActionContext = { now: ctx.state.now, userId: ctx.state.user?.id, userName: ctx.state.user?.name };\n`;
    sb += `    const action = ({\n`;
    for (const action of config.actions) {
        const functionName = action.name.charAt(0).toLowerCase() + action.name.substring(1);
        sb += `        '${action.method} ${action.public ? '/public' : ''}/v1/${action.path}': () => ${functionName}(ax, `;
        for (const parameter of action.parameters) {
            const method = parameter.type == 'id' ? 'id' : 'string';
            sb += `v.${method}('${parameter.name}'), `;
        }
        if (action.body) {
            sb += 'ctx.body, ';
        }
        sb = sb.substring(0, sb.length - 2) + '),\n';
    }
    sb += '    } as Record<string, () => Promise<any>>)[\`\${ctx.method} \${pathname}\`];\n';
    sb += `    return action ? { body: await action() } : { error: new MyError('not-found', 'invalid-invocation') };\n`;
    sb += `}\n`;
    return sb;
}
// index.tsx, return null for not ok
function generateWebInterfaceClient(config: CodeGenerationConfig, originalContent: string): string {

    let sb = originalContent;
    sb = sb.substring(0, sb.indexOf('// AUTOGEN'));
    sb += '// AUTOGEN\n';
    sb += '// --------------------------------------\n';
    sb += '// ------ ATTENTION AUTO GENERATED ------\n';
    sb += '// --------------------------------------\n';

    // NOTE this is hardcode replaced in make.ts
    sb += `template-client.tsx`.replaceAll('api.example.com/example', `api.example.com/${config.appname}`);

    sb += 'const api = {\n';
    // for now now action.key only used here
    for (const action of config.actions.filter(a => a.key == 'main')) {
        const functionName = action.name.charAt(0).toLowerCase() + action.name.substring(1);
        sb += `    ${functionName}: (`;
        for (const parameter of action.parameters) {
            const type = parameter.type == 'id' ? 'number' : 'string';
            sb += `${parameter.name}: ${type}, `;
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
                sb += `${parameter.name}, `;
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
    return sb;
}

interface CodeGenerationOptions {
    emit: boolean, // actually write file
    client: boolean, // include client side targets
    server: boolean, // include server side targets
}
// return true for ok, false for not ok
export async function generateCode(config: CodeGenerationConfig, options: CodeGenerationOptions): Promise<boolean> {
    logInfo('codegen', 'code generation');
    let hasError = false;

    const createTask = (path: string, generate: (config: CodeGenerationConfig) => string) => async () => {
        const generatedContent = generate(config);
        if (!generatedContent) {
            hasError = true;
        }
        if (options.emit && generatedContent) {
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
        if (options.emit && generatedContent) {
            // write file may throw error, but actually you don't need to care about that
            logInfo('codegen', chalk`write {yellow ${path}}`);
            await fs.writeFile(path, generatedContent);
        }
    };

    const tasks = [
        { kind: 'server', name: 'database.d.ts', run: createTask('src/server/database.d.ts', generateDatabaseTypes) },
        { kind: 'server', name: 'database.sql', run: createTask('src/server/database.sql', generateDatabaseSchema) },
        { kind: 'client,server', name: 'api.d.ts', run: createTask('src/shared/api.d.ts', generateWebInterfaceTypes) },
        { kind: 'server', name: 'index.ts', run: createPartialTask('src/server/index.ts', generateWebInterfaceServer) },
        { kind: 'client', name: 'index.tsx', run: createPartialTask('src/client/index.tsx', generateWebInterfaceClient) },
    ].filter(t => (options.client && t.kind.includes('client')) || (options.server && t.kind.includes('server')));
    // console.log('scheduled tasks', tasks);
    await Promise.all(tasks.map(t => t.run()));

    hasError ? logError('codegen', 'code generation completed with error') : logInfo('codegen', 'code generation complete');
    return !hasError;
}
