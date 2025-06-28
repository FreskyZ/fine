import net from 'node:net';

// temporary standalone script to send common through core module admin interface

let command;
const commandName = process.argv[2];
if (commandName == 'reload-static') {
    const key = process.argv[3];
    if (!key) {
        console.error('missing key for reload-static');
        process.exit(1);
    }
    command = { type: 'content', sub: { type: 'reload-static', key } };
} else if (commandName == 'reload-config') {
    command = { type: 'content', sub: { type: 'reload-config' } };
} else if (commandName == 'enable-signup') {
    command = { type: 'access', sub: { type: 'enable-signup' } };
} else {
    console.error('unknown command');
    process.exit(1);
}

const socket = net.createConnection('/tmp/fine.socket');
const serializedCommand = JSON.stringify(command);
socket.on('error', error => {
    console.log('socket error', error);
});
socket.on('timeout', () => {
    console.log('socket timeout');
    socket.destroy(); // close is not auto called after this event
});
socket.once('data', data => {
    if (data.toString('utf-8') == 'ACK') {
        console.log('received ACK');
        setImmediate(() => { socket.destroy(); });
    }
});
socket.write(serializedCommand);
