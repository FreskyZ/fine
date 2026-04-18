import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
// after so many years of syncfs today I find
// that node:fs without /promise is non-promise-fs, not syncfs, it contains callback fs as async fs
import npfs from 'node:fs';
import path from 'node:path';
import dayjs from 'dayjs';
import dayjsUTCPlugin from 'dayjs/plugin/utc.js';
import yaml from 'yaml';

dayjs.extend(dayjsUTCPlugin);
const configPath = path.resolve(process.env['FINE_CONFIG_DIR'] ?? '', 'backup.yml');
const config = yaml.parse(await fs.readFile(configPath, 'utf-8')) as {
    databases: string[],
    aliyunoss: {
        region: string,
        internal: boolean,
        bucket: string,
        'access-key-id': string,
        'access-key-secret': string,
        path?: string,
    },
};

// add simply log to record details
// every backup operation generate a new log file, log file name is date,
// first line of log file is a success flag, avoid duplicate run in same day
// create a log() function capturing logs: string[]
function createlog(logs: string[]) {
    return (message: string) => {
        logs.push(`${dayjs().format('HH:mm:ss.SSS')} ${message}`);
    };
}

// return nothing: although there maybe error (how?), other backup operations should continue regardless of this
async function dumpDatabases(logs: string[]) {
    const log = createlog(logs);
    await Promise.all(config.databases.map(async item => {
        const [username, databaseName] = item.split(':').map(v => v.trim());
        console.log(`backup.ts: dump database ${item}`);
        log(`spawning pg_dump ${item}`);
        const child = spawn('pg_dump', ['--username', username, databaseName], { stdio: ['ignore', 'pipe', 'pipe'] });
        const content = await new Promise<string>(resolve => {
            let content = '';
            child.stdout.on('data', data => {
                content += data; // this seems to be string
            });
            child.stderr.on('data', data => {
                log(`pg_dump ${item} unexpected stderr: ${data}`);
            });
            child.on('error', error => {
                log(`pg_dump ${item} error? ${error}`);
                resolve(null); // ignore error and continue other backup work
            });
            child.on('close', async (code, signal) => {
                // document says one of code and signal will not be null
                // if you code??signal, it will become null for code=0, so use signal??code
                log(`pg_dump ${item} returned with ${signal ?? code}, received stdout ${content.length} bytes`);
                resolve(content);
            });
        });
        if (content) {
            log(`pg_dump ${item} write to /data/base/${databaseName}.sql`);
            try {
                // this by default overwrites file if exists, which is good
                await fs.writeFile(`/data/base/${databaseName}.sql`, content);
            } catch (error) {
                log(`pg_dump ${item} write ${databaseName}.sql error, skip, ${error}`);
            }
        } else {
            log(`pg_dump ${item} empty stdout?`);
        }
    }));
}

// return result file, return null for not ok
// // save the content and tar tf to check valid: await fs.writeFile('test.tar.xz', bundleFiles(logs));
async function bundle(logs: string[]): Promise<Buffer<ArrayBuffer>> {
    const log = createlog(logs);
    console.log(`backup.ts: tar`);
    log('spawning tar');
    // no specific data needed in stdout or stderr, use inherit
    const child = spawn('tar', ['cJf', '-', '/data'], { stdio: ['ignore', 'pipe', 'pipe'] });
    return await new Promise<Buffer<ArrayBuffer>>(resolve => {
        const chunks = [];
        child.stdout.on('data', data => {
            chunks.push(data);
        });
        child.stderr.on('data', data => {
            log(`tar stderr: ${data}`);
        });
        child.on('error', error => {
            log(`tar error? abort, ${error}`);
            console.log(`backup.ts: tar error? check logs for detail`);
            resolve(null);
        });
        child.on('close', async (code, signal) => {
            const data = Buffer.concat(chunks);
            log(`tar returned with ${signal ?? code}, received stdout ${data.length} bytes`);
            resolve(data);
        });
    });
}

interface OSSResult {
    status: number,
    headers: Record<string, any>,
    body?: string | Buffer<ArrayBuffer>,
}
export async function sendAliyunOSSRequest(options: {
    logs: string[],
    time: dayjs.Dayjs,
    region: string,
    internal: boolean,
    bucket: string,
    keyId: string,
    secret: string,
    // list: GET /?queryparameters
    // upload: PUT /objectname
    // download: GET /objectname
    // remove: DELETE /objectname
    method: 'GET' | 'PUT' | 'DELETE',
    // path or folder is part of the object name
    object?: string,
    query?: Record<string, string>,
    // this function will provide content-length, content-type, x-oss-date, x-oss-content-sha256
    // for now
    //   upload use x-oss-forbid-overwrite,
    //   get may use range?,
    //   delete no specific header,
    //   list no specific header, this use query parameter
    headers: Record<string, string>,
    body?: Buffer<ArrayBuffer>,
    binaryResponse?: boolean,
}): Promise<OSSResult> {

    const log = createlog(options.logs);
    (() => {
        const { logs, keyId, secret, body, ...filteredOptions } = options;
        log(`request aliyun oss, options=${JSON.stringify(
            filteredOptions, undefined, 2)}${body ? `, body=${body.length} bytes` : ''}`);
    })();
    
    // official sdk source code https://github.com/ali-sdk/ali-oss/blob/master/lib/common/signUtils.js
    // signature document https://help.aliyun.com/zh/oss/developer-reference/recommend-to-use-signature-version-4
    // NOTE don't read the graph or image for the steps, it contains incorrect information, read the detail tables

    const headers = { ...options.headers };
    if (options.body) {
        headers['content-type'] = 'application/octet-stream';
        headers['content-length'] = options.body.length.toString();
    }
    // this does not work
    // headers['accept'] = 'application/json,*/*';
    // this is not in api reference and example, but seems required according to document and official code
    // code at https://github.com/ali-sdk/ali-oss/blob/fa263d22ca4c6599cb987c3db6325c86c7a5dc6b/lib/common/utils/createRequest.js#L34
    headers['x-oss-content-sha256'] = 'UNSIGNED-PAYLOAD';
    // this is not in api reference and example, but seems required according to document and official code
    headers['x-oss-date'] = options.time.format('YYYYMMDDTHHmmss[Z]');

    // the signing algorithm need you to delcare additional headers used in the calculation process,
    // except required headers, required headers are content-type, content-md5 and all x-oss-* headers,
    // or else the server side cannot calculate the signature from the bottom up and get the same result.
    // the document does not say all other headers need to be included in additional header list,
    // for now I include all other headers in the header list provided to fetch option,
    // but the fetch implementation default will add some default headers, like host, ua, accept, etc.
    // so I think you are kind of free to pick additional headers, but lazy to test whether empty list
    // is ok, and use a more precise pick strategy is not meaningful, so use the current strategy
    const additionalHeaderNames = `` + Object.keys(headers).map(h => h.toLowerCase())
        .filter(h => h != 'content-type' && h != 'content-md5' && !h.startsWith('x-oss-')).join(';');
    const canonicalRequest = [
        options.method,
        // canonical uri,
        // /bucketname/objectname, or /bucketname/ if no object name (bucket level operation)
        // according to official code, need to handle a few additional characters
        `/${options.bucket}/${options.object ?? ''}`.split('/')
            .map(s => encodeURIComponent(s).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)).join('/'),
        // canonical query,
        // NOTE require empty line if no query string, so do not filter this out by x => x
        !options.query ? '' : Object.entries(options.query)
            .map(([p, v]) => [p.toLowerCase(), v])
            .sort(([p1], [p2]) => p1.localeCompare(p2))
            .map(([p, v]) => `${encodeURIComponent(p.trim())}=${encodeURIComponent(v.trim())}`).join('&'),
        // canonical headers
        // must include headers: x-oss-content-sha256
        // must include headers if exist: content-type, content-md5 and x-oss-*
        // include additional headers
        Object.entries(headers)
            .map(([h, v]) => [h.toLowerCase(), v])
            .sort(([h1], [h2]) => h1.localeCompare(h2))
            // NOTE no whitespace around colon
            // ATTENTION map(+\n).join(), not map().join(\n), headers part always have an empty line to mark ending
            .map(([h, v]) => `${h.trim()}:${v.trim()}\n`).join(''),
        // additional header names,
        additionalHeaderNames,
        // // this is called hashed payload or x-oss-content-sha256 in official code
        // // I guess they want to hash content but that's not ok for large files, but still keep the field for dream
        'UNSIGNED-PAYLOAD',
    ].join('\n');
    log('canonical request:\n' + canonicalRequest);

    const credentialBase = `${options.time.format('YYYYMMDD')}/${options.region}/oss/aliyun_v4_request`;
    const stringToSign = [
        'OSS4-HMAC-SHA256',
        // document say iso8601,
        // official code says timestamp?, and format is YYYYMMDDThhmmssZ, the format in official code is here if you don't find
        // https://github.com/ali-sdk/ali-oss/blob/fa263d22ca4c6599cb987c3db6325c86c7a5dc6b/lib/common/utils/createRequest.ts#L43
        options.time.format('YYYYMMDDTHHmmss[Z]'),
        // // this is called scope in this part of document,
        // // but nearly same as credential field in final result, so I call this credentialbase
        credentialBase,
        // canonical request
        crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n');
    log('string to sign:\n' + stringToSign);

    // what is using previous step hash result as next step key?
    const signature1 = crypto.createHmac('sha256', `aliyun_v4${options.secret}`).update(options.time.format('YYYYMMDD')).digest();
    const signature2 = crypto.createHmac('sha256', signature1).update(options.region).digest();
    const signature3 = crypto.createHmac('sha256', signature2).update('oss').digest();
    const signature4 = crypto.createHmac('sha256', signature3).update('aliyun_v4_request').digest();
    // stringtosign is here if you lost track
    const signature5 = crypto.createHmac('sha256', signature4).update(stringToSign).digest('hex');

    // document amazingly use a whitespace after comma, official code don't have that, so I don't add the whitespace
    headers['authorization'] = `OSS4-HMAC-SHA256 ` + [
        `Credential=${options.keyId}/${credentialBase}`,
        // do not include additionalheaders if no additionalheaders
        additionalHeaderNames.length ? `AdditionalHeaders=${additionalHeaderNames}` : '',
        `Signature=${signature5}`,
    ].filter(x => x).join(',');

    const url = new URL(`https://${options.bucket}.oss-${options.region}${options.internal ? '-internal' : ''}.aliyuncs.com`);
    // url.pathname = undefined reesult in 'example.com/undefined' if you ask
    if (options.object) { url.pathname = options.object; }
    if (options.query) { Object.entries(options.query).map(([p, v]) => url.searchParams.set(p, v)); }
    log(`url: ${url}`);
    log(`processed headers: ${JSON.stringify(headers)}`);

    let response: Response;
    try {
        response = await fetch(url, { method: options.method, headers, body: options.body });
    } catch (error) {
        log(`fetch error: ${error}`);
        return { status: 400, headers: {} };
    }

    log(`response status: ${response.status}`);
    // only x-oss-* is important, others are not
    const responseHeaders = Object.fromEntries(response.headers.entries().filter(([k]) => k.startsWith('x-oss-')));
    log(`response headers: ${JSON.stringify(responseHeaders, undefined, 2)}`);

    let responseBody: string | Buffer<ArrayBuffer>;
    if (options.binaryResponse) {
        responseBody = Buffer.from(await response.arrayBuffer());
        log(`response body: ${responseBody.length} bytes`);
    } else {
        // at this "fetch api response object don't have .xml()" era, these apis is returning xml
        responseBody = await response.text();
        if (responseBody) { log(`response body:\n` + responseBody); }
    }

    return { status: response.status, headers: responseHeaders, body: responseBody };
}

// return true for ok, false for now ok
async function upload(time: dayjs.Dayjs, logs: string[], bundledContent: Buffer<ArrayBuffer>): Promise<boolean> {

    const filename = `fine-backup-${time.format('YYYYMMDD-HHmmss')}.tar.xz`;
    console.log(`backup.ts: upload ${filename}`);
    const result = await sendAliyunOSSRequest({
        logs,
        time,
        region: config.aliyunoss.region,
        internal: config.aliyunoss.internal,
        bucket: config.aliyunoss.bucket,
        keyId: config.aliyunoss['access-key-id'],
        secret: config.aliyunoss['access-key-secret'],
        method: 'PUT',
        object: filename,
        body: bundledContent,
        // https://help.aliyun.com/zh/oss/developer-reference/putobject
        headers: {
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
        },
    });
    if (Math.floor(result.status / 100) != 2) {
        console.log(`backup.ts: upload not ok, check logs for detail`);
        return false;
    }
    return true;
}

async function backupOnce(time: dayjs.Dayjs) {
    console.log(`backup.ts: start backup`);
    let ok = false;
    const logs: string[] = [];
    await dumpDatabases(logs);
    const bundledContent = await bundle(logs);
    if (bundledContent) {
        ok = await upload(time, logs, bundledContent);
    }
    logs.unshift(ok ? 'ok' : 'no');

    const backupLogFileName = path.resolve(logsDirectory, `backup-${time.format('YYYYMMDD-HHmmss')}.log`);
    console.log(`backup.ts: save log to ${backupLogFileName}`);
    const resultlogs = logs.map(r => r.trim() + '\n').join('');
    try {
        await fs.writeFile(backupLogFileName, resultlogs);
    } catch (error) {
        console.log(resultlogs);
        console.log(`backup.ts: write log file error?`, error);
        console.log(`backup.ts: abort because cannot maintain backup logs to correctly schedule`);
        process.exit(1);
    }
}
// await backupOnce(dayjs.utc());

const logsDirectory = path.resolve(process.env['BACKUP_LOGS_DIR'] ?? '');
async function schedule() {
    console.log('backup.ts: start scheduling');

    let sleeping = false;
    // use request shutdown not direct shutdown to avoid interupting network operation,
    // interupt pgdump or tar is ok actually, but no need to distinguish them
    let shutdownRequested = false;
    const requestShutdown = () => {
        if (sleeping) {
            // ...but when sleeping you need to exit directly, or else have to wait 1 hour
            console.log('backup.ts: shutdown requested, exit');
            process.exit(0);
        } else {
            console.log('backup.ts: requesting shutdown');
            shutdownRequested = true;
        }
    };
    process.on('SIGINT', requestShutdown);
    process.on('SIGTERM', requestShutdown);

    // let mocktime = dayjs.utc();
    while (true) {
        if (shutdownRequested) {
            console.log('backup.ts: shutdown requested, exit (2)');
            process.exit(0);
        }
        sleeping = true;
        // this is sleep, if you forget
        await new Promise<void>(resolve => setTimeout(() => resolve(), 3600_000)); // mock: 1_000)); ((
        sleeping = false;
        // wakeup and find it's time and find no related success log for this date, initiate backup

        let time = dayjs.utc(); // mock: mocktime = mocktime.add(1, 'hour'); to achieve add 1 hour per second
        if (time.hour() < 18) { continue; } // use hour >= 18 to effectly allow 6 times of retry if some error happens

        let filenames: string[];
        try {
            filenames = await fs.readdir(logsDirectory);
        } catch (error) {
            console.log('backup.ts: readdir error', error);
            console.log(`backup.ts: abort because cannot maintain backup logs to correctly schedule`);
            process.exit(1);
        }
        let ok = false;
        const todayFileNames = filenames
            // reverse sort filenames, the ok file normally is the last file if there are multiple files
            .filter(n => n.startsWith(`backup-${time.format('YYYYMMDD')}`)).sort((n1, n2) => n2.localeCompare(n1));
        for (const filename of todayFileNames) {
            try {
                const file = npfs.createReadStream(path.join(logsDirectory, filename), {
                    encoding: 'utf-8',
                    // NOTE the range is inclusive
                    // if file length is less than this, will return less content not throw error
                    start: 0, end: 1,
                });
                if ((await file.toArray()).join('') == 'ok') { ok = true; break; }
            } catch (error) {
                console.log(`backup.ts: read previous log file ${filename} error, skip`, error);
            }
        }
        if (ok) { continue; }

        // mock content for test, adjust  vvv  this number to control success rate
        // const mockok = Math.random() > 0.5 ? 'ok' : 'no';
        // console.log(`mock content backup-${time.format('YYYYMMDD-HHmmss')}.log: ${mockok}`);
        // await fs.writeFile(path.resolve(logsDirectory, `backup-${time.format('YYYYMMDD-HHmmss')}.log`), mockok);
        // continue;
        backupOnce(time);
    }
}
await schedule();
