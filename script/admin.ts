import { send } from './admin-base';

const commandLine = process.argv.slice(2);

if (commandLine[0] == 'shutdown') {
    send({ type: 'shutdown' });
} else if (commandLine[0] == 'content-update') {
    if (commandLine.length == 3) {
        send({ type: 'content-update', parameter: { app: commandLine[1], name: commandLine[2] } })
            .then(() => process.exit(0)); // send and die or directly let unhandled rejection die
    } else {
        console.log('[adm] reload missing parameters');
    }
} else {
    console.log('[adm] unknown command');
}
