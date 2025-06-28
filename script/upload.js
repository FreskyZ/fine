import fs from 'node:fs';
import path from 'node:path';
import Client from 'ssh2-sftp-client';

const client = new Client();
await client.connect({
    host,
    username,
    privateKey,
    passphrase,
});

const workflows = {
    // pure non-js html files
    html: [
        ['src/static/home.html', 'static/home.html'],
        ['src/static/short.html', 'static/short.html'],
        ['src/static/404.html', 'static/404.html'],
        ['src/static/418.html', 'static/418.html'],
    ],
    // temp standalone admin
    tsadmin: [
        ['script/admin.js', 'admin.js'],
    ],
    // chat
    chat: [
        ['../small/theai/chat-server.js', 'servers/chat.js'],
        ['../small/theai/chat.html', 'static/chat.html'],
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
