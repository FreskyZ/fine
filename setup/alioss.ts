import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'path';
import dayjs from 'dayjs';
import dayjsUTCPlugin from 'dayjs/plugin/utc.js';
import yaml from 'yaml';
import { XMLParser } from 'fast-xml-parser';

// aliyun oss list, upload, download, remove functions

interface OSSRequest {
    logs: string[],
    region: string,
    internal: boolean,
    bucket: string,
    keyId: string,
    secret: string,
    time: dayjs.Dayjs,
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
    // default to xml
    responseBodyType?: 'xml' | 'binary',
}
interface OSSResponse {
    status: number,
    headers: Record<string, any>,
    body?: string | Buffer<ArrayBuffer>,
}
async function sendRequest(options: OSSRequest): Promise<OSSResponse> {

    const log = (message: string) => options.logs.push(`${dayjs().format('HH:mm:ss.SSS')} ${message}`);
    (() => {
        const { logs, keyId, secret, body, ...filteredOptions } = options;
        log(`request aliyun oss, options=${JSON.stringify(
            filteredOptions, undefined, 2)}${body ? `, body=${body.length} bytes` : ''}`);
    })();

    // official sdk source code https://github.com/ali-sdk/ali-oss/blob/master/lib/common/signUtils.js
    // signature document https://help.aliyun.com/zh/oss/developer-reference/recommend-to-use-signature-version-4
    // NOTE don't read the graph or image in the document, it contains incorrect information, read the detail tables

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
    try {
        if (options.responseBodyType == 'binary') {
            responseBody = Buffer.from(await response.arrayBuffer());
            log(`response body: ${responseBody.length} bytes`);
        } else {
            // at this "fetch api response type even don't have .xml()" era, these apis are returning xml
            responseBody = await response.text();
            log(`response body:\n` + responseBody);
        }
    } catch (error) {
        log(`receive body error: ${error}`);
        // and the return statement correctly return status, headers and without body
    }
    return { status: response.status, headers: responseHeaders, body: responseBody };
}

export interface OSSConfig {
    region: string,
    internal: boolean,
    bucket: string,
    'access-key-id': string,
    'access-key-secret': string,
}
function getCommonRequestProperties(config: OSSConfig, options: OSSOptionBase): Pick<OSSRequest,
    | 'logs'
    | 'region'
    | 'internal'
    | 'bucket'
    | 'keyId'
    | 'secret'
    | 'time'
> {
    return {
        logs: options.logs ?? [],
        region: config.region,
        internal: config.internal,
        bucket: config.bucket,
        keyId: config['access-key-id'],
        secret: config['access-key-secret'],
        time: options.time ?? dayjs.utc(),
    };
}

export interface OSSOptionBase {
    time?: dayjs.Dayjs, // default to utc now if not provided
    logs?: string[],    // discard logs if not provided
}
export interface OSSResultBase {
    ok: boolean,
    code?: string, // error code
    error?: Record<string, string>, // error detail like code, message and help link
}

// default options are enough for current usage
const xmlparser = new XMLParser();
// for now only extract code from error response document
interface ErrorResponseDocument {
    Error: {
        Code: string,
    },
}

export interface ListOptions extends OSSOptionBase {
    count?: number,
    // sort and filter by name > this name
    startAfter?: string,
    prefix?: string,
    // if true, continue to fetch all result meet current query parameters, default to false
    continue?: boolean,
    // TODO figure out what happens when prefix + delimeter than add to this options
}
export interface ListResultFile {
    name: string,
    size: number,
    mtime: string,
}
export interface ListResult extends OSSResultBase {
    files?: ListResultFile[],
}
export async function list(config: OSSConfig, options: ListOptions): Promise<ListResult> {

    // https://help.aliyun.com/zh/oss/developer-reference/listobjects-v2
    const request: OSSRequest = {
        ...getCommonRequestProperties(config, options),
        method: 'GET',
        query: {
            'list-type': '2',
            // 'start-after': sort and filter by name>start-after object
            ...(options.startAfter ? { 'start-after': options.startAfter } : {}),
            // 'continuation-token': get from last result NextContinuationToken TODO multi page handling should be here
            // 'max-keys': max count, note that may return <max-keys even there are more records
            ...(options.count ? { 'max-keys': options.count.toString() } : {}),
            // 'prefix'
            ...(options.prefix ? { 'prefix': options.prefix } : {}),
            // 'delimiter': what's this talking about? this is not simple filter prefix and group by?
            // 'fetch-owner': use true to fetch owner, not used in this project
        },
        headers: {},
    };
    interface SuccessResponseDocument {
        ListBucketResult: {
            NextContinuationToken?: string,
            Contents: {
                Key: string,
                LastModified: string,
                Size: number,
            }[] | {
                Key: string,
                LastModified: string,
                Size: number,
            }, // ? when only one element, this is directly the object?
        },
    }

    let loopCount = 0;
    let continuationToken: string;
    const files: ListResultFile[] = [];

    while (true) {
        if (continuationToken) {
            request.query['continuation-token'] = continuationToken;
        } // no need to clear because continue token always have value *after* once assign to request
        const response = await sendRequest(request);
        if (!response.body) { 
            return { ok: false, code: 'empty-response-body?' };
        }

        let responseDocument: SuccessResponseDocument | ErrorResponseDocument;
        try {
            responseDocument = xmlparser.parse(response.body);
        } catch (error) {
            return { ok: false, code: 'xml-parse-error?', error: { error } };
        }
        if ('Error' in responseDocument) {
            if (!responseDocument.Error || !responseDocument.Error.Code) {
                return { ok: false, code: 'unknown-response-xml-structure?', error: { document: JSON.stringify(responseDocument) } };
            } else {
                return { ok: false, code: responseDocument.Error.Code, error: responseDocument.Error };
            }
        }
        if (!responseDocument.ListBucketResult
            || !responseDocument.ListBucketResult.Contents
            || (!Array.isArray(responseDocument.ListBucketResult.Contents) && !responseDocument.ListBucketResult.Contents['Key'])
        ) {
            console.log(!responseDocument.ListBucketResult, !responseDocument.ListBucketResult.Contents)
            return { ok: false, code: 'unknown-response-xml-structure-2?', error: { document: JSON.stringify(responseDocument) } };
        }

        const responseContents = responseDocument.ListBucketResult.Contents;
        files.push(...(Array.isArray(responseContents) ? responseContents: [responseContents]).map(c => ({
            name: c.Key,
            size: c.Size,
            mtime: c.LastModified,
        })));

        // do not want to continue, break
        if (!options.continue) { break; }
        // no continue token, break
        // these 2 breaks should be more clear than add a isfirst flag and check in while condition
        if (!responseDocument.ListBucketResult.NextContinuationToken) { break; }
        continuationToken = responseDocument.ListBucketResult.NextContinuationToken;

        loopCount += 1;
        // hard limit loop count to avoid accidental infinite loop
        if (loopCount > 100) { return { ok: false, code: 'call-count?' }; }
    }

    return { ok: true, files };
}

// list is not using this because it also have success response,
// extract similar logic for list like operations if needed in future 
function handleErrorResponse(response: OSSResponse): OSSResultBase {
    if (!response.body) {
        return { ok: false, code: 'not-2xx-but-no-response-body?' };
    }
    let responseDocument: ErrorResponseDocument;
    try {
        responseDocument = xmlparser.parse(response.body);
    } catch (error) {
        return { ok: false, code: 'xml-parse-error?', error: { error } };
    }
    if (!responseDocument.Error || !responseDocument.Error.Code) {
        return { ok: false, code: 'unknown-response-xml-structure?', error: { document: JSON.stringify(responseDocument) } };
    } else {
        return { ok: false, code: responseDocument.Error.Code, error: responseDocument.Error };
    }
}

export interface UploadOptions extends OSSOptionBase {
    filename: string,
    content: Buffer<ArrayBuffer>,
    // default to false
    forbidOverwrite?: boolean,
}
export interface UploadResult extends OSSResultBase {
}
export async function upload(config: OSSConfig, options: UploadOptions): Promise<UploadResult> {

    // https://help.aliyun.com/zh/oss/developer-reference/putobject
    const response = await sendRequest({
        ...getCommonRequestProperties(config, options),
        method: 'PUT',
        object: options.filename,
        body: options.content,
        headers: {
            // 'cache-control': this is cache control when downloading, these files do not use normal http download
            // 'content-disposition': this is download behavior, too
            // 'content-encoding': no need to compress again, so leave it identity
            // 'content-md5': don't use md5
            // 'expires': no expires
            // 'x-oss-forbid-overwrite': good to avoid accidentally upload again
            ...(options.forbidOverwrite ? { 'x-oss-forbid-overwrite': 'true' } : {}),
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

    if (Math.floor(response.status / 100) == 2) {
        return { ok: true };
    } else {
        return handleErrorResponse(response);
    }
}

export interface DownloadOptions extends OSSOptionBase {
    filename: string,
    // add ranges if needed in future
}
export interface DownloadResult extends OSSResultBase {
    content?: Buffer<ArrayBuffer>,
}
export async function download(config: OSSConfig, options: DownloadOptions): Promise<DownloadResult> {

    // https://help.aliyun.com/zh/oss/developer-reference/getobject
    const response = await sendRequest({
        ...getCommonRequestProperties(config, options),
        method: 'GET',
        object: options.filename,
        // query: {
            // 'response-content-language'
            // 'response-expires'
            // 'response-cache-control'
            // 'response-content-disposition'
            // 'response-content-encoding': set response header by set url params?
        // },
        headers: {
            // 'range': http standard range
            // 'x-oss-multi-range-behavior': set to 'multi-range' to allow multi range
            // 'if-modified-since'
            // 'if-unmodified-since'
            // 'if-match'
            // 'if-non-match': standard cache control headers
        },
        responseBodyType: 'binary',
    });

    // if file not exist, return 404 and xml! response body
    if (Math.floor(response.status / 100) == 2) {
        return { ok: true, content: response.body as Buffer<ArrayBuffer> };
    } else {
        handleErrorResponse(response);
    }
}

interface RemoveOptions extends OSSOptionBase {
    filename: string,
}
interface RemoveResult extends OSSResultBase {
}
export async function remove(config: OSSConfig, options: RemoveOptions): Promise<RemoveResult> {

    // https://help.aliyun.com/zh/oss/developer-reference/deleteobject
    const response = await sendRequest({
        ...getCommonRequestProperties(config, options),
        method: 'DELETE',
        object: options.filename,
        // query: {
            // 'versionId': not use version control
        // },
        headers: {},
    });
    // if file removed, return 204, if file not exist, also return 204?
    if (Math.floor(response.status / 100) == 2) {
        return { ok: true };
    } else {
        handleErrorResponse(response);
    }
}

// when runing as main script, allow basic command line command input (no repl)
if (import.meta.main) {
    if (process.argv.length < 3) {
        console.log(`USAGE: alioss.ts list | upload filename | download filename | remove filename`);
        console.log(`NOTE: advanced usage should use this file as a library`);
        process.exit(1);
    }

    // do not extend utc when use as library, the caller may not want this // really?
    dayjs.extend(dayjsUTCPlugin);

    const logs: string[] = [];
    const config: OSSConfig = yaml.parse(await fs.readFile('/etc/fine/backup.yml', 'utf-8')).aliyunoss;

    if (process.argv.length == 3 && process.argv[2] == 'list') {
        console.log('alioss.ts: list');
        const result = await list(config, { logs, continue: true });
        if (!result.ok) {
            console.log(`alioss.ts: list error, check logs /tmp/alioss.log`, result);
        } else {
            for (const file of result.files) {
                // UPDATE: the mtime is my provided time in one of the 4 access to time in the signature process
                console.log(`  ${file.name} ${file.size} bytes at ${file.mtime}`);
            }
            console.log(`alioss.ts: list success`);
        }
    } else if (process.argv.length == 4 && process.argv[2] == 'upload') {
        const filename = process.argv[3];
        console.log(`alioss.ts: upload ${filename}`);
        const content = await fs.readFile(filename);
        const result = await upload(config, { logs, filename, content, forbidOverwrite: true });
        if (!result.ok) {
            console.log(`alioss.ts: error, check logs /tmp/alioss.log`, result);
        } else {
            console.log(`alioss.ts: upload ${filename} success`);
        }
    } else if (process.argv.length == 4 && process.argv[2] == 'download') {
        const filename = process.argv[3];
        console.log(`alioss.ts: download ${filename}`);
        const result = await download(config, { logs, filename });
        if (!result.ok) {
            console.log(`alioss.ts: error, check logs /tmp/alioss.log`, result);
        } else {
            const basename = path.basename(filename);
            await fs.writeFile(basename, result.content);
            console.log(`alioss.ts: download ${filename} success, write ${basename} ${result.content.length} bytes`);
        }
    } else if (process.argv.length == 4 && process.argv[2] == 'remove') {
        const filename = process.argv[3];
        console.log(`alioss.ts: remove ${filename}`);
        const result = await remove(config, { filename });
        if (!result.ok) {
            console.log(`alioss.ts: error, check logs /tmp/alioss.log`, result);
        } else {
            console.log(`alioss.ts: remove ${filename} success`);
        }
    }

    // when running as cli, save log to /tmp/alioss.log
    await fs.writeFile('/tmp/alioss.log', logs.map(r => r.trim() + '\n').join());
}
