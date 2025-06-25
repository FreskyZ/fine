# Service Deployment

the systemd service description file is like this, copy it here incase I forget

```ini, /etc/systemd/system/file.socket
[Unit]
Description = fine http and https socket

[Socket]
ListenStream = 80
ListenStream = 443

[Install]
WantedBy = sockets.target
```

```ini, /etc/systemd/system/fine.service
[Unit]
Description = fine service
Requires = fine.socket

[Service]
WorkingDirectory = <working directory>
ExecStart = npm run start
ExecStop = npm run stop
Restart = on-failure
RestartSec = 15
User = fine
Group = fine
Environment = "NODE_ENV=production"

[Install]
WantedBy = multi-user.target
```

when server startup, use this, 3 and 4 is fixed value, not arbitrary example value

```js
httpServer.listen({ fd: 3 }); // instead of .listen(80)
httpsServer.listen({ fd: 4 }); // instead of .listen(443)
```

enable and start the socket and service

```sh
$ systemctl enable fine.socket
$ systemctl start fine.socket
$ systemctl enable fine.socket
```

use `systemctl stop fine.socket` to stop both, disable to disable and edit

### Debug Consideration

to directly run server binary with sudo, run a small proxy with root

```js
import net from 'node:net';

// Redirect TCP from port 80 to 6001 (HTTP)
net.createServer((clientSocket) => {
  const targetSocket = net.connect(6001, '127.0.0.1');

  clientSocket.pipe(targetSocket);
  targetSocket.pipe(clientSocket);

  clientSocket.on('error', (err) => {
    console.error('Client socket error:', err);
    targetSocket.destroy();
  });
  targetSocket.on('error', (err) => {
    console.error('Target socket error:', err);
    clientSocket.destroy();
  });
}).listen(80, () => {
  console.log('TCP redirector listening on port 80 -> 6001');
});

// Redirect TCP from port 443 to 6002 (HTTPS)
net.createServer((clientSocket) => {
  const targetSocket = net.connect(6002, '127.0.0.1');

  clientSocket.pipe(targetSocket);
  targetSocket.pipe(clientSocket);

  clientSocket.on('error', (err) => {
    console.error('Client socket error:', err);
    targetSocket.destroy();
  });
  targetSocket.on('error', (err) => {
    console.error('Target socket error:', err);
    clientSocket.destroy();
  });
}).listen(443, () => {
  console.log('TCP redirector listening on port 443 -> 6002');
});
```

and listen to 6001 and 6002 when server is not socket activation, this should be better than mysterious firewall rules
