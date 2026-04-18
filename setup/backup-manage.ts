import fs from 'node:fs/promises';
import path from 'node:path';
import dayjs from 'dayjs';
import yaml from 'yaml';
// TODO this runs the script, try split into something like -helper and -schedule, and deploy them both in container
import { sendAliyunOSSRequest } from './backup-auto.ts';

// sync files from oss to local specific folder
// (for me it is a onedrive path so easily +2 different physical location backup)
// also allow manually manage files?

const configPath = path.resolve('/etc/fine/backup.yml');
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

// allow manual inspect, remove, download and upload files?
// https://help.aliyun.com/zh/oss/developer-reference/listobjects-v2
async function list() {
    const time = dayjs.utc();
    const logs: string[] = [];
    const result1 = await sendAliyunOSSRequest({
        logs,
        time,
        region: config.aliyunoss.region,
        internal: config.aliyunoss.internal,
        bucket: config.aliyunoss.bucket,
        keyId: config.aliyunoss['access-key-id'],
        secret: config.aliyunoss['access-key-secret'],
        method: 'GET',
        query: {
            'list-type': '2',
            // 'start-after': sort and filter by name>start-after object
            // 'continuation-token': get from last result NextContinuationToken
            // 'max-keys': max count, note that may return <max-keys even there are more records
            // 'prefix'
            // 'delimiter': what's this talking about? this is not simple filter prefix and group by?
            // 'fetch-owner': use true to fetch owner, no multiple user for this project for now so no need
        },
        headers: {},
    });
    // ListBucketResult>
    //   Name> bucket name
    //   Prefix> seems not parameter value
    //   MaxKeys> seems parameter value
    //   Delimiter> seems parameter value
    //   IsTruncated> document says something meaningless, you still don't know when will truncate
    //   NextContinuationToken>? this is optional
    //   Contents>* multiple contents element
    //     Key> looks like object name, include path and file name
    //     LastModified> iso8601
    //     ETag> strong etag, standard etag have double quote if you forget
    //     Type> all 'Normal' for me, 'Normal' | 'Multipart' | 'Appendable' | 'Symlink'
    //     Size> size in bytes
    //     StorageClass> all Standard for now
    // for now major fields are Content>Key, LastModified, Size, or Error>Code, Message if root element is Error
    console.log(result1);
    console.log(logs.join('\n') + '\n');
}

// https://help.aliyun.com/zh/oss/developer-reference/getobject
async function get(filename: string) {
    const time = dayjs.utc();
    const logs: string[] = [];
    const result1 = await sendAliyunOSSRequest({
        logs,
        time,
        region: config.aliyunoss.region,
        internal: config.aliyunoss.internal,
        bucket: config.aliyunoss.bucket,
        keyId: config.aliyunoss['access-key-id'],
        secret: config.aliyunoss['access-key-secret'],
        method: 'GET',
        object: filename,
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
        binaryResponse: true,
    });
    // if file not exist, return 404 and xml! response body
    console.log(logs.join('\n') + '\n');
    if (result1.body) {
        await fs.writeFile(filename, result1.body);
    }
}
await get('fine-backup-20260418-131554.tar.xz');

// https://help.aliyun.com/zh/oss/developer-reference/deleteobject
async function remove() {
    const time = dayjs.utc();
    const logs: string[] = [];
    const result1 = await sendAliyunOSSRequest({
        logs,
        time,
        region: config.aliyunoss.region,
        internal: config.aliyunoss.internal,
        bucket: config.aliyunoss.bucket,
        keyId: config.aliyunoss['access-key-id'],
        secret: config.aliyunoss['access-key-secret'],
        method: 'DELETE',
        object: 'fine-backup-20260418-083453.tar.xz',
        // query: {
            // 'versionId': not use version control
        // },
        headers: {},
    });
    // if file removed, return 204, if file not exist, return 204?
    console.log(result1);
    console.log(logs.join('\n') + '\n');
}
