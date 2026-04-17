#!node
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from '/usr/local/lib/node_modules/yaml/dist/index.js';

const configPath = path.resolve(process.env['FINE_CONFIG_DIR'] ?? '', 'backup.yml');
const config = yaml.parse(await fs.readFile(configPath, 'utf-8')) as {
    databases: string[],
    aliyunoss: {
        region: string,
        bucket: string,
        'access-key-id': string,
        'access-key-secret': string,
        path?: string,
    },
};

// although pg_dump may error (how?), other backup operations should continue regardless of this
async function dumpDatabases() {
    await Promise.all(config.databases.map(async item => {
        const [username, databaseName] = item.split(':').map(v => v.trim());
        console.log(`backup.ts: spawning pg_dump ${item}`);
        const child = spawn('pg_dump', ['--username', username, databaseName], { stdio: ['ignore', 'pipe', 'pipe'] });
        const content = await new Promise<string>(resolve => {
            let content = '';
            child.stdout.on('data', data => {
                content += data; // TODO is this string?
            });
            child.stderr.on('data', data => {
                console.log(`backup.ts: pg_dump ${item} unexpected stderr data:`, data);
            });
            child.on('error', error => {
                console.log(`backup.ts: pg_dump ${item} error?`, error);
                resolve(null); // ignore error and continue other backup work
            });
            child.on('close', async (code, signal) => {
                // document says one of code and signal will not be null
                // if you code??signal, it will become null for code=0, so use signal??code
                console.log(`backup.ts: pg_dump ${item} returned with ${signal ?? code}, received stdout ${content.length} bytes`);
                resolve(content);
            });
        });
        if (content) {
            console.log(`backup.ts: pg_dump ${item} write to /data/base/${databaseName}.sql`);
            await fs.writeFile(`/data/base/${databaseName}.sql`, content);
        }
    }));
}

// return result file name, return null for not ok
async function bundleFiles(): Promise<string> {
    const time = new Date();
    // this is how you live without dayjs
    const displayTime = [
        time.getUTCFullYear(),
        // don't forget java date.month start from 0
        // don't forget to pad 0
        (time.getUTCMonth() + 1).toString().padStart(2, '0'),
        // don't forget jave date.date is day of month, .day is day of week
        time.getUTCDate().toString().padStart(2, '0'),
    ].join('') + '-' + [
        time.getUTCHours().toString().padStart(2, '0'),
        time.getUTCMinutes().toString().padStart(2, '0'),
        // by the way, getutcseconds is same as getseconds because timezones don't differ in seconds
        time.getUTCSeconds().toString().padStart(2, '0'),
    ].join('');
    const backupFileName = `fine-backup-${displayTime}.tar.xz`;

    console.log(`backup.ts: spawning tar ${backupFileName}`);
    // no specific data needed in stdout or stderr, use inherit
    const child2 = spawn('tar', ['cJf', backupFileName, '/data'], { stdio: 'inherit' });
    return await new Promise<string>(resolve => {
        child2.on('error', error => {
            console.log(`backup.ts: tar error?`, error);
            console.log(`backup.ts: abort this backup operation`);
            resolve(null);
        });
        child2.on('close', async (code, signal) => {
            console.log(`backup.ts: tar returned with ${signal ?? code}`);
            resolve(backupFileName);
        });
    });
}

async function upload(filename: string) {
    // throw error if cannot stat, which is ok
    const stat = await fs.stat(filename);
    console.log(`backup.ts: upload ${filename}`);

    const internal = false;
    const endpoint = `${config.aliyunoss.bucket}.oss-${config.aliyunoss.region}${internal ? '-internal' : ''}.aliyuncs.com`;
    const pathname = path.join(config.aliyunoss.path ?? '/', filename);

    // and life without dayjs, again
    const time = new Date();
    const displayDate = [
        time.getUTCFullYear().toString(),
        (time.getUTCMonth() + 1).toString().padStart(2, '0'),
        time.getUTCDate().toString().padStart(2, '0'),
    ].join('');
    const displayTime = [
        time.getUTCHours().toString().padStart(2, '0'),
        time.getUTCMinutes().toString().padStart(2, '0'),
        time.getUTCSeconds().toString().padStart(2, '0'),
    ].join('');

    // https://help.aliyun.com/zh/oss/developer-reference/putobject
    const headers = {
        // 'host': endpoint, // seems no need to set host if same as in url
        'content-length': stat.size.toString(),
        'content-type': 'application/octet-stream',
        // 'cache-control': this is cache control when downloading, these files do not use normal http download
        // 'content-disposition': this is download behavior, too
        // 'content-encoding': no need to compress again, so leave it identity
        // 'content-md5': don't use md5
        // 'expires': no expires
        'x-oss-forbid-overwrite': 'true', // good to avoid accidentally upload again
        // 'x-oss-server-side-encryption'
        // 'x-oss-server-side-data-encryption'
        // 'x-oss-server-side-encryption-key-id': do not use server side encryption
        // 'x-oss-object-acl': default should be enough
        // 'x-oss-storage-class': use standard for now
        // 'x-oss-meta-*'
        // 'x-oss-tagging': no metadata needed for now
        // 'x-oss-object-worm-mode'
        // 'x-oss-object-worm-retain-util-date': what is worm?
        // this is not in api reference and example, but seems required according to sign document and code
        // code at https://github.com/ali-sdk/ali-oss/blob/fa263d22ca4c6599cb987c3db6325c86c7a5dc6b/lib/common/utils/createRequest.js#L34
        'x-oss-content-sha256': 'UNSIGNED-PAYLOAD',
        // this is not in api reference and example, but seems required according to sign document and code
        'x-oss-date': `${displayDate}T${displayTime}Z`,
    };
    console.log('backup.ts: request headers', headers);
    
    // https://help.aliyun.com/zh/oss/developer-reference/recommend-to-use-signature-version-4
    // https://github.com/ali-sdk/ali-oss/blob/master/lib/common/signUtils.js
    // NOTE this document is not same as alidns document in certification.md
    // UPDATE: you need this in aliyun subaccount access control script https://ram.console.aliyun.com/policies/detail
    // "Statement": [{
    //     "Effect": "Allow",
    //     "Action": "oss:ListObjects",
    //     "Resource": "acs:oss:oss-{region}:{account}:generic-backup"
    // }, {
    //     "Effect": "Allow",
    //     "Action": ["oss:PutObject", "oss:GetObject", "oss:DeleteObject"],
    //     "Resource": "acs:oss:oss-{region}:{account}:generic-backup/*"
    // }]
    // if you put the putobject inside first statement, the action is
    // object level and cannot match this resource identifier, and you receive 403 + implicitdeny in response

    const additionalHeaders = `` + Object.keys(headers).map(h => h.toLowerCase())
        .filter(h => h != 'content-type' && h != 'content-md5' && !h.startsWith('x-oss-')).join(';');
    const canonicalRequest = [
        // method, upper case
        'PUT',
        // canonical uri,
        // document graph says full uri?,
        // document table looks like encodeURI(/bucketname/objectname),
        // code looks like encodeURIComponent(/bucketname/objectname).replace(%2F, /)?
        // I guess they mean this
        `/${encodeURIComponent(config.aliyunoss.bucket)}/${encodeURIComponent(filename)}`,
        // canonical query string, sort key, then key1=val1&key2=val2
        // NOTE require empty line if no query string, so do not filter this out by x => x
        '',
        // canonical headers
        // must include headers: x-oss-content-sha256
        // must include headers if exist: content-type, content-md5 and x-oss-*
        // include additional headers
        // sort key, then header1:value1\nheader2:value2, no whitespace around colon
        // TODO not sure whether need to include all headers, for now I'm include all my
        //   provided headers, but fetch will include some default headers like host, accept, ua, etc.
        Object.entries(headers)
            .map(([h, v]) => [h.toLowerCase(), v])
            .sort(([h1], [h2]) => h1.localeCompare(h2))
            // ATTENTION map(\n).join(), not map().join(\n), headers part have a fixed empty line end
            .map(([h, v]) => `${h.trim()}:${v.trim()}\n`).join(''),
        // additional headers, only content-length for now
        additionalHeaders,
        'UNSIGNED-PAYLOAD',
    ].join('\n');

    const credential = `${displayDate}/${config.aliyunoss.region}/oss/aliyun_v4_request`;
    const stringToSign = [
        'OSS4-HMAC-SHA256',
        // document say iso8601, code says timestamp?, and format is YYYYMMDDThhmmssZ
        // the format in code is here if you don't find
        // https://github.com/ali-sdk/ali-oss/blob/fa263d22ca4c6599cb987c3db6325c86c7a5dc6b/lib/common/utils/createRequest.ts#L43
        `${displayDate}T${displayTime}Z`,
        // scope
        credential,
        // canonical request
        crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n');

    // what is using previous step hash result as next step key?
    const sign1 = crypto.createHmac('sha256', `aliyun_v4${config.aliyunoss['access-key-secret']}`).update(displayDate).digest();
    const sign2 = crypto.createHmac('sha256', sign1).update(config.aliyunoss.region).digest();
    const sign3 = crypto.createHmac('sha256', sign2).update('oss').digest();
    const sign4 = crypto.createHmac('sha256', sign3).update('aliyun_v4_request').digest();
    const signature = crypto.createHmac('sha256', sign4).update(stringToSign).digest('hex');

    // document amazingly use a whitespace after comma, code don't have that, so I don't add the whitespace
    headers['authorization'] = `OSS4-HMAC-SHA256 Credential=${config.aliyunoss[
        'access-key-id']}/${credential},AdditionalHeaders=${additionalHeaders},Signature=${signature}`;

    const response = await fetch(`https://${endpoint}${pathname}`, {
        method: 'PUT',
        headers,
        body: await fs.readFile(filename),
    });
    console.log(`backup.ts: response status`, response.status);
    console.log(`backup.ts: response headers`, response.headers);
    const responseBody = await response.text();
    if (responseBody) {
        console.log(`backup.ts: response body`, responseBody.trim());
    }
    if (responseBody.includes('<Code>SignatureDoesNotMatch</Code>')) {
        console.log(`my canonical request`, canonicalRequest);
        console.log(`my string to sign`, stringToSign);
    }
    console.log(`backup.ts: upload ${filename} complete`);
}

async function backup() {
    console.log('backup.ts: start scheduling');

    while (true) {
        await dumpDatabases();
        const filename = await bundleFiles();
        if (filename) {
            await upload(filename);
        }
    }
}

// if command line parameter is a file name
// download the backup file from oss
// restore the file into the folders
// restore data into database
async function restore() {

}
