import fs from 'node:fs/promises';
import path from 'node:path';
import Client from 'ssh2-sftp-client';

const config = JSON.parse(await fs.readFile('akaric', 'utf-8'));
const client = new Client();
await client.connect({
    host: config['main-domain'],
    username: config.ssh.user,
    privateKey: await fs.readFile(config.ssh.identity),
    passphrase: config.ssh.passphrase,
});

const workflows = {
    // pure non-js html files
    html: [
        ['src/static/home.html', 'static/home.html'],
        ['src/static/short.html', 'static/short.html'],
        ['src/static/404.html', 'static/404.html'],
        ['src/static/418.html', 'static/418.html'],
    ],
    // remote command center
    cc: [
        ['script/command-center.js', 'akari.js'],
    ],
}

const workflowName = process.argv[2];
if (!workflowName || !(workflowName in workflows)) {
    console.error('missing workflow name or invalid workflow name');
    process.exit(1);
}

for (const [localPath, remotePath] of workflows[workflowName]) {
    const localFullPath = path.resolve(localPath);
    const remoteFullPath = path.join('/var/fine', remotePath);
    await client.fastPut(localFullPath, remoteFullPath);
    console.log(`Uploaded: ${localPath} -> ${remoteFullPath}`);
}

client.end();
