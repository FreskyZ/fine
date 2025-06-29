
remember my workflow when designing the new script

### core
```
$ (LOCAL) node script/build-core.js
$ (REMOTE) node index.js
to support node index.js on remote, need
$ (REMOTE) sudo node portpipe.js
```

### html
```
home.html, short.html, 404.html, 418.html
$ (LOCAL) node script/upload.js html
$ (REMOTE) node admin.js reload-static home
```

### user
```
$ (LOCAL) node script/build-user.js
$ (REMOTE) node admin.js reload-static user
```

### chat
```
$ (LOCAL:small/theai) node build.js
$ (REMOTE) node admin.js reload-static chat
$ (REMOTE) node admin.js reload-server chat
```

?
certbot -d example.com
sudo chown -R fine:fine /etc/letsencrypt/live/example.com
sudo chown -R fine:fine /etc/letsencrypt/archive/example.com
