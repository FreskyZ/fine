import { sendAdminMessage } from './admin-base';

const commandLine = process.argv.slice(2);

if (commandLine[0] == 'shutdown') {
    sendAdminMessage({ type: 'shutdown' });
} else if (commandLine[0] == 'reload') {
    if (commandLine.length == 3) {
        if (commandLine[1] == 'static' || commandLine[1] == 'index') {
            sendAdminMessage({ type: 'reload', parameter: { type: commandLine[1], name: commandLine[2] } })
                .then(() => process.exit(0)); // send and die or directly let unhandled rejection die
        } else {
            console.log('[adm] unknown reload type');
        }
    } else {
        console.log('[adm] reload missing parameters');
    }
} else {
    console.log('[adm] unknown command');
}
