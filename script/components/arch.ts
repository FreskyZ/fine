import fs from 'node:fs/promises';
import readline from 'node:readline/promises';
import tls from 'node:tls';
import { type BuildScriptConfig, logInfo, logError } from './logger.ts';
import { deploy } from './sftp.ts';

// command center client architecture

const config: BuildScriptConfig = JSON.parse(await fs.readFile('akari.json', 'utf-8'));

export async function startCommandCenterClient(
    handleRemoteCommand: (command: any) => Promise<any>,
    handleLocalCommand: (command: string) => Promise<void>,
) {
    // ???
    const myCertificate = await fs.readFile(config.certificate, 'utf-8');
    const originalCreateSecureContext = tls.createSecureContext;
    tls.createSecureContext = options => {
        const originalResult = originalCreateSecureContext(options);
        if (!options.ca) {
            originalResult.context.addCACert(myCertificate);
        }
        return originalResult;
    };

    let websocket: WebSocket;
    const readlineInterface = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    function connectRemoteCommandCenter() {
        websocket = new WebSocket(`wss://${config.domain}:8001/for-build`);
        websocket.addEventListener('close', async () => {
            logInfo('ccc', `websocket disconnected`);
            await readlineInterface.question('input anything to reconnect: ');
            connectRemoteCommandCenter();
        });
        websocket.addEventListener('error', async error => {
            logInfo('ccc', `websocket error:`, error);
            await readlineInterface.question('input anything to reconnect: ');
            connectRemoteCommandCenter();
        });
        websocket.addEventListener('open', async () => {
            logInfo('ccc', `websocket connected, you'd better complete authentication quickly`);
            const token = await readlineInterface.question('> ');
            websocket.send(token);
            logInfo('ccc', 'listening to remote request');
        });
        websocket.addEventListener('message', async event => {
            logInfo('ccc', 'websocket received data', event.data);
            const result = await handleRemoteCommand(event.data);
            const response = await fetch(`https://${config.domain}:8001/local-build-complete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(result),
            });
            if (response.ok) {
                logInfo('ccc', 'POST /local-build-complete ok');
            } else {
                logError('ccc', 'POST /local-build-complete not ok', response);
            }
        });
    }
    connectRemoteCommandCenter();
    readlineInterface.on('SIGINT', () => {
        websocket?.close();
        process.exit(0);
    });
    for await (const command of readlineInterface) {
        if (command == 'exit') {
            websocket?.close();
            process.exit(0);
        } else if (command.startsWith('upload ')) {
            const [, local, remote] = command.split(' ');
            if (!local || !remote) {
                console.error('invalid upload command, expecting upload localpath remotepath');
            } else {
                await deploy(config, [{ data: await fs.readFile(local), remote }]);
            }
        } else if (command.startsWith('build')) {
            await handleRemoteCommand(command);
        }
        await handleLocalCommand(command);
        readlineInterface.prompt();
    }
}
