import fs from 'node:fs/promises';
import path from 'node:path';
import dayjs from 'dayjs';
import type * as koa from 'koa';
import yaml from 'yaml';
import { log } from './logger.js';

// block requests try to exploit security vulnerabilities,
// the feature is called "dare you try touch these locations!",
// abbreviated "don't try!", abbreviated "dontry" in module names, config and log file names

// - this is inspired by fail2ban, see https://github.com/fail2ban/fail2ban, install fail2ban
//   need run arbitrary setup.py script on host, and some optional dependencies need to be
//   installed in global scope or venv, all of these are unacceptable
// - the validation part must happen here because the rules need to read request properties,
//   while it's not easy to retrieve related information from tcp traffic because the server
//   is using http2 only, and this program is and should be the first and the only place to
//   parse http2 protocol, parse it at some other place at host side and perform the validation
//   and make up new http request is unacceptable
// - by the way, although you can `ip a` in container with --network host, you cannot run the
//   nft command in container because that explicitly checks root user, docker group does not
//   work, root user inside container does not work because that is not same as real root user
//   outside, so the validation part and the rule manipulation part must be separated, see setup/dontry.py

// for now rules include
// 1. non-GET method to GET-only path (for now all non-api path),
//   indicates a scriptified access, normal browser access and simple curl access don't do that
// 2. access to specific host, for now the list include old subdomains in my old main domain,
//   this indicates reading certificate transparency logs
// 3. access to specific path, like .env
// 4. frequent 404 response, indicates scan through potential vulnerability paths

// forbidden hosts (2) and paths (3) are in config
const dontryConfigPath = path.resolve(process.env['FINE_CONFIG_DIR'] ?? '', 'dontry.yml');
const dontryConfig = yaml.parse(await fs.readFile(dontryConfigPath, 'utf-8')) as { host: string[], path: string[] };
// read blocked addresses and forbid them go furthur in this program, in case dontry.py does not catch up,
// regard all ip values in the log file as been blocked, expecting outdated records will be cleared (by whom?)
const dontryLogPath = path.resolve(path.resolve(process.env['FINE_LOGS_DIR'] ?? 'logs'), 'dontry.log');

// the addresses are same format as in ctx.ip, or the import('net').Socket.ip property value
const blockedAddresses: string[] = [];
// block candidates only save in memory
const blockCandidates: {
    name: string,
    // time is YYYYMMDDHHmm
    records: { time: string, count: number }[],
}[] = [];

async function readBlockedAddresses() {
    try {
        const raw = await fs.readFile(dontryLogPath, 'utf-8');
        const records = raw.split('\n').filter(x => x).map(v => v.trim());
        // ignore invalid format records, when will that happen?
        const addresses = records.map(r => r.split(' ').filter(x => x)[1]);
        blockedAddresses.splice(0, blockedAddresses.length); addresses.forEach(r => blockedAddresses.push(r));
        log.info({ cat: 'dontry', kind: 'read blocked addresses', count: addresses.length });
    } catch (error) {
        log.error({ cat: 'dontry', message: `failed to read and process ${dontryLogPath}?`, error });
    }
}
await readBlockedAddresses();

// count blocked requests to indicate potential mismatch
let blockCount = 0;
// cleanup
setInterval(() => {
    log.info({ cat: 'dontry', message: `last cleanup cycle see ${blockCount} blocked requests` });
    blockCount = 0;
    readBlockedAddresses();
    const now = dayjs.utc().format('YYYYMMDDHHmm');
    // clear outdated candidates
    const clearedCandidates = blockCandidates.map(b => b.records.some(r => r.time == now)
        ? { name: b.name, records: b.records.filter(r => r.time == now) } : null).filter(x => x);
    blockCandidates.splice(0, blockCandidates.length); clearedCandidates.forEach(c => blockCandidates.push(c));
}, 3600_000);

export async function handleTryRequest(ctx: koa.Context, next: koa.Next): Promise<void> {

    // simply return early for the request in this program
    // formal block should happen in firewall configuration
    if (blockedAddresses.includes(ctx.ip)) { blockCount += 1; return; }

    const block = async (reason: string) => {
        blockCount += 1;
        blockedAddresses.push(ctx.ip);
        await fs.appendFile(dontryLogPath, `${dayjs.utc().format('YYYYMMDDTHHmmss[Z]')} ${ctx.ip} ${reason}\n`);
    };
    const url = ctx.URL;
    if (url.host != 'api.example.com' && ctx.method != 'GET' && ctx.method != 'HEAD') {
        return await block(`forbidden method ${ctx.method} ${url.host}${url.pathname}`);
    }
    for (const host of dontryConfig.host) {
        if (url.host == host) {
            return await block(`forbidden host ${host}`);
        } else if (host.startsWith('*') && url.host.endsWith(host.substring(1)) && url.host != `www${host.substring(1)}`) {
            return await block(`forbidden host ${host}`);
        }
    }
    for (const path of dontryConfig.path) {
        if (url.pathname.includes(path)) {
            return await block(`forbidden path ${path} in ${url.host}${url.pathname}`);
        }
    }

    await next(); // next is here

    if (ctx.status == 404) {
        const thisMinute = dayjs.utc().format('YYYYMMDDHHmm');
        const candidateIndex = blockCandidates.findIndex(b => b.name == ctx.ip);
        if (candidateIndex >= 0) {
            const record = blockCandidates[candidateIndex].records.find(r => r.time == thisMinute);
            if (record) {
                record.count += 1;
                if (record.count == 10) {
                    blockCandidates.splice(candidateIndex, 1);
                    return await block('frequent 404');
                }
            } else {
                blockCandidates[candidateIndex].records.push({ time: thisMinute, count: 1 });
            }
        } else {
            blockCandidates.push({ name: ctx.ip, records: [{ time: thisMinute, count: 1 }] });
        }
    }

    // log all request when debug flag is enabled after the validation,
    // ctx.url, or the pathname+query part is included in http2 pseudo header :path, also ctx.method and ctx.host
    log.debug({ cat: 'request', ip: ctx.ip, headers: ctx.headers, status: ctx.status });
}
