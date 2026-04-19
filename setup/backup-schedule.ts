import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
// after so many years of syncfs today I find
// that node:fs without /promise is non-promise-fs, not syncfs, it contains callback fs as async fs
import npfs from 'node:fs';
import path from 'node:path';
import dayjs from 'dayjs';
import dayjsUTCPlugin from 'dayjs/plugin/utc.js';
import yaml from 'yaml';
import * as oss from './alioss.ts';
import type { OSSConfig } from './alioss.ts';

dayjs.extend(dayjsUTCPlugin);
const configPath = path.resolve(process.env['FINE_CONFIG_DIR'] ?? '', 'backup.yml');
const config = yaml.parse(await fs.readFile(configPath, 'utf-8')) as {
    databases: string[],
    aliyunoss: OSSConfig & {
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

// return true for ok, false for now ok
async function upload(time: dayjs.Dayjs, logs: string[], content: Buffer<ArrayBuffer>): Promise<boolean> {
    const filename = `fine-backup-${time.format('YYYYMMDD-HHmmss')}.tar.xz`;
    console.log(`backup.ts: upload ${filename}`);
    const result = await oss.upload(config.aliyunoss, { time, logs, filename, content });
    if (!result.ok) {
        console.log(`backup.ts: upload not ok, check logs for detail`);
    }
    return result.ok;
}

const logsDirectory = path.resolve(process.env['BACKUP_LOGS_DIR'] ?? '');
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
        await backupOnce(time);
    }
}
await schedule();
