import fs from 'node:fs/promises';
import path from 'node:path';
import dayjs from 'dayjs';
import dayjsUTCPlugin from 'dayjs/plugin/utc.js';
import yaml from 'yaml';
import * as oss from './alioss.ts';
import type { OSSConfig } from './alioss.ts';

// sync files from oss to local specific folder
// (for me it is a onedrive path so easily +2 different physical location backup)

dayjs.extend(dayjsUTCPlugin);
const config = yaml.parse(await fs.readFile('/etc/fine/backup.yml', 'utf-8')) as {
    aliyunoss: OSSConfig & {
        path?: string,
    },
    'local-copy': {
        directory: string,
    },
};

// download missing files, once, no retry
async function sync() {

    const localDirectory = config['local-copy'].directory;
    const localDirectoryStat = await fs.stat(localDirectory);
    if (!localDirectoryStat.isDirectory()) {
        console.log(`sync.ts: local directory ${localDirectory} is not a directory`);
        return;
    }
    const localFiles = await fs.readdir(localDirectory);

    const listlogs: string[] = [];
    const listResult = await oss.list(config.aliyunoss, { logs: listlogs, continue: true });
    if (!listResult.ok) {
        console.log('sync.ts: failed to list, logs: ', listlogs.join('\n'));
        return;
    }
    const remoteFiles = listResult.files;

    // exist in remote but not exist in local,
    // note that local can have more files than remote, don't remove local files
    const missingFiles = remoteFiles.filter(f => !localFiles.includes(f.name));
    if (missingFiles.length == 0) {
        console.log('sync.ts: up to date');
        return;
    }

    await Promise.all(missingFiles.map(async file => {
        const logs: string[] = [];
        console.log(`sync.ts: download ${file.name}`);
        const result = await oss.download(config.aliyunoss, { logs, filename: file.name });
        if (!result.ok) {
            console.log(`sync.ts: download ${file.name} error?`, logs.join('\n'));
        } else {
            try {
                await fs.writeFile(path.join(localDirectory, file.name), result.content);
                console.log(`sync.ts: download ${file.name} success`);
            } catch (error) {
                console.log(`sync.ts: download ${file.name} write error?`, error);
            }
        }
    }));
}

// don't forget to map the real directory into container
// export AUTO_BACKUP_DIR=/mnt/c/Users/.../OneDrive/...
// docker run -it --rm --name backup-shell1 -h BACKUP-SHELL -v .:/work -v $AUTO_BACKUP_DIR:/auto-backup -v /etc/fine:/etc/fine -w /work my/node:1
await sync();

// try:
// tar xJf /auto-backup/fine-backup-20260418-131554.tar.xz -C /
// git init
// git commit -m"initial commit"
// tar xJf a newer file
// git status
// for now, letsencrypt log name rotation is very inconvenient, and for now, database and fine core is adding meaningless log records
