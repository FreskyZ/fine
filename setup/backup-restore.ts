import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import npfs from 'node:fs';
import dayjs from 'dayjs';
import dayjsUTCPlugin from 'dayjs/plugin/utc.js';
import yaml from 'yaml';
import * as oss from './alioss.ts';
import type { OSSConfig } from './alioss.ts';

dayjs.extend(dayjsUTCPlugin);
const config = yaml.parse(await fs.readFile('backup.yml', 'utf-8')) as {
    databases: string[],
    aliyunoss: OSSConfig & {
        path?: string,
    },
};
// NOTE this script is interactive script, do not write log file

// return file name for ok, null for not ok
async function getFileName(suggestFilename?: string) {

    const osslogs: string[] = [];
    const listResult = await oss.list(config.aliyunoss, { logs: osslogs });
    if (process.env['OSS_LOG']) {
        osslogs.forEach(r => console.log(r));
    }
    if (!listResult.ok) {
        console.log('restore.ts: oss list not ok, use OSS_LOG=1 for detail');
        return null;
    }
    if (listResult.files.length == 0) {
        console.log('restore.ts: no oss file to restore');
        return null;
    }

    if (!suggestFilename) {
        let maxFile: typeof listResult.files[0];
        let maxFileTime: string;
        for (const file of listResult.files) {
            const match = /^fine-backup-(\d{8}\-\d{6}).tar.xz$/.exec(file.name);
            if (!match) { continue; } // ignore format mismatch
            // this need plugin
            // const time = dayjs(match[1], 'YYYYMMDD-HHmmss');
            // and actually you can use string compare for isAfter, this is very valid after d8-d6 capture
            if (!maxFileTime || match[1] > maxFileTime) {
                maxFile = file;
                maxFileTime = match[1];
            }
        }
        return maxFile.name; // maxfile must exist after check length > 0
    } else {
        const match = listResult.files.filter(f => f.name.includes(suggestFilename));
        if (match.length == 0) {
            console.log(`restore.ts: no file name match ${suggestFilename}`);
            return null;
        }
        if (match.length > 1) {
            console.log(`restore.ts: multiple files match ${suggestFilename}, use a more specific name`);
            return null;
        }
        return match[0].name;
    }
}

// return true for ok, false for not ok
async function extract(filename: string, targetDirectory: string) {
    if (npfs.existsSync('/extract')) {
        console.log(`restore.ts: non empty /extract, rm in case it has remaining files`);
        return;
    }
    await fs.mkdir('/extract');
    console.log(`restore.ts: extract`);
    const child = spawn('tar', ['xJf', filename, '-C', targetDirectory], { stdio: ['ignore', 'pipe', 'pipe'] });
    return await new Promise<boolean>(resolve => {
        const timeout = setTimeout(() => {
            console.log(`restore.ts: tar timeout? when will this happen?`); 
            resolve(false);
        }, 60_000);
        child.stdout.on('data', data => console.log(`tar: ${data}`));
        child.stderr.on('data', data => console.log(`tar: ${data}`));
        child.on('error', error => {
            console.log(`restore.ts: tar error?`, error);
            if (timeout) { clearTimeout(timeout); }
            resolve(false);
        });
        child.on('close', (code, signal) => {
            console.log(`restore.ts: tar returned with ${signal ?? code} to /extract`);
            if (timeout) { clearTimeout(timeout); }
            resolve(true);
        });
    });
}

async function restoreDatabases() {
    await Promise.all(config.databases.map(async item => {
        const [username, databaseName] = item.split(':').map(v => v.trim());
        console.log(`restore.ts: restore database ${item}`);
        // check database exist
        // psql -Atc "SELECT 1 FROM pg_database WHERE datname='fine'"
        const child1 = spawn('psql', [
            '--username', username,
            '-Atc', `SELECT 1 FROM pg_database WHERE datname='${databaseName}'`,
        ], { stdio: ['ignore', 'pipe', 'pipe'] });
        const databaseExist = await new Promise<boolean>(resolve => {
            const timeout = setTimeout(() => {
                console.log(`psql(1) ${item} timeout? when will this happen?`); 
                resolve(false);
            }, 300_000);
            let content = '';
            child1.stdout.on('data', data => { content += data; });
            child1.stderr.on('data', data => {
                console.log(`restore.ts: psql(1) ${item} unexpected stderr: ${data}`);
                if (timeout) { clearTimeout(timeout); }
                resolve(false);
            });
            child1.on('error', error => {
                console.log(`restore.ts: psql(1) ${item} error?`, error);
                if (timeout) { clearTimeout(timeout); }
                resolve(false);
            });
            child1.on('close', async (code, signal) => {
                console.log(`restore.ts: psql(1) ${item} returned with ${signal ?? code} output ${content.trim()}`);
                if (timeout) { clearTimeout(timeout); }
                if (content.trim() == '1') {
                    // normal exist
                    resolve(true);
                } else if (content.length == 0) {
                    console.log(`restore.ts: psql(1) ${item} shows database not exist, skip`);
                    resolve(false);
                } else {
                    console.log(`restore.ts: psql(1) ${item} output unexpected content?`);
                    resolve(false);
                }
            });
        });
        if (!databaseExist) { return; } // continue other databases
        // check database empty
        // psql --dbname fine -Atc "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
        const child2 = spawn('psql', [
            '--username', username,
            '--dbname', databaseName,
            '-Atc', `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
        ], { stdio: ['ignore', 'pipe', 'pipe'] });
        const databaseEmpty = await new Promise<boolean>(resolve => {
            const timeout = setTimeout(() => {
                console.log(`psql(2) ${item} timeout? when will this happen?`); 
                resolve(false);
            }, 300_000);
            let content = '';
            child2.stdout.on('data', data => { content += data; });
            child2.stderr.on('data', data => {
                console.log(`restore.ts: psql(2) ${item} unexpected stderr: ${data}`);
                if (timeout) { clearTimeout(timeout); }
                resolve(false);
            });
            child2.on('error', error => {
                console.log(`restore.ts: psql(2) ${item} error?`, error);
                if (timeout) { clearTimeout(timeout); }
                resolve(false);
            });
            child2.on('close', async (code, signal) => {
                console.log(`restore.ts: psql(2) ${item} returned with ${signal ?? code} output ${content.trim()}`);
                if (timeout) { clearTimeout(timeout); }
                if (content.trim().length) {
                    console.log(`restore.ts: psql(2) ${item} shows database not empty, skip`);
                }
                resolve(content.trim().length == 0);
            });
        });
        if (!databaseEmpty) { return; } // continue other databases

        const child3 = spawn('psql', [
            '--username', username,
            '--dbname', databaseName,
            '-f', `/extract/data/base/${databaseName}.sql`,
        ], { stdio: ['ignore', 'pipe', 'pipe'] });
        await new Promise<void>(resolve => {
            const timeout = setTimeout(() => {
                console.log(`psql(3) ${item} timeout? when will this happen?`); 
                resolve();
            }, 300_000);
            child3.stdout.on('data', data => console.log(`psql(3) ${item}: ${data}`));
            child3.stderr.on('data', data => console.log(`psql(3) ${item}: ${data}`));
            child3.on('error', error => {
                console.log(`restore.ts: psql(3) ${item} error?`, error);
                if (timeout) { clearTimeout(timeout); }
                resolve(); // ignore error and continue other backup work
            });
            child3.on('close', async (code, signal) => {
                console.log(`restore.ts: psql(3) ${item} returned with ${signal ?? code}`);
                if (timeout) { clearTimeout(timeout); }
                resolve();
            });
        });
    }));
}

async function restore(auto: boolean, filename?: string) {
    console.log(`restore.ts:${auto ? '' : ' manual'} filename=${filename ?? '(latest)'}`);

    const realFileName = await getFileName(filename);
    if (!realFileName) { return; }
    console.log(`restore.ts: oss download ${realFileName}`);

    // const osslogs: string[] = [];
    // const downloadResult = await oss.download(config.aliyunoss, { filename: realFileName, logs: osslogs });
    // if (process.env['OSS_LOG']) {
    //     osslogs.forEach(r => console.log(r));
    // }
    // if (!downloadResult.ok) {
    //     console.log('restore.ts: oss download not ok, use OSS_LOG=1 for detail');
    //     return null;
    // }
    // await fs.writeFile(`/${realFileName}`, downloadResult.content);
    console.log(`restore.ts: download /${realFileName} complete`);

    if (!await extract(`/${realFileName}`, '/extract')) { return; }
    console.log(`restore.ts: extract /extract/data complete`);
    if (!auto) { return; } // noauto exit here

    await Promise.all(['/data/certificates', '/data/configs', '/data/program'].map(async volume => {
        // the target directories should exist and be empty
        try {
            if ((await fs.readdir(volume)).length != 0) {
                console.log(`restore.ts: non empty ${volume}? don't run in running environment`);
                return;
            }
        } catch {
            console.log(`restore.ts: non exist ${volume}? check volume mapping`);
            return;
        }
        // cannot rename from /extract/data/program to /data/program, that is volume mapping target,
        // but can rename all top level item in the directory, fs.rename work for both file and directory
        try {
            const items = await fs.readdir(`/extract${volume}`);
            await Promise.all(items.map(async e => {
                console.log(`restore.ts: mv to ${volume}/${e}`);
                await fs.rename(`/extract${volume}/${e}`, `${volume}/${e}`);
            }));
        } catch (error) {
            console.log(`restore.ts: readdir or rename error`, error);
            return;
        }
    }).concat(restoreDatabases())); // <-- restore databases is here if you are missing

    console.log(`restore.ts: restore ${realFileName} complete`);
}

// restore.ts # restore latest file
// restore.ts 20260501 # restore selected file, use .includes, should only result in 1 file
// restore.ts manual # download and decompress latest file to /extract, no restore
// restore.ts manual 20260501 # download and decompress selected file to /extract
if (process.argv[2] == 'manual') {
    await restore(false, process.argv[3]);
} else {
    await restore(true, process.argv[2]);
}
