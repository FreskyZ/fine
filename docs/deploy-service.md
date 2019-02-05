# Deployment reminder

the systemd service description file is like this, copy it here incase I forget

```ini
[Unit]
Description = <service description>

[Service]
WorkingDirectory = <working directory>
ExecStart = npm run start-server
ExecStop = npm run stop-server
Restart = always
RestartSec = 15
User = root
Group = root
StandardOutput = syslog
SyslogIdentifier = <servic name>
Environment = "NODE_ENV=production"

[Install]
WantedBy = multi-user.target
```

copy this file to `/etc/systemd/system/<service name>.service` and use 
`systemctl enable <service name>` to enable, `start` to start, `stop` to stop,
and `disable` to disable
