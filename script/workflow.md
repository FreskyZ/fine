
remember my workflow when designing the new script

### core
```
$ (REMOTE) node cc.js
$ (LOCAL) node script/build-core.js
$ (REMOTE) core
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
$ (REMOTE) node cc.js
$ (LOCAL) node script/build-user.js
$ (REMOTE) user
```

### chat
```
$ (REMOTE) node cc.js
$ (LOCAL:small/theai) node build.js
$ (REMOTE) chat
```

?
certbot -d example.com
sudo chown -R fine:fine /etc/letsencrypt/live/example.com
sudo chown -R fine:fine /etc/letsencrypt/archive/example.com
