
# Certificate by Let's Encrypt

1. install snap by `apt install snapd`
2. install certbot by `snap install --classic certbot`
3. prepare a webserver where `/.well-known/acme-challenge` is gettable 
   and required domains are accessible (200 response, https), then simply run 

   ```
   $ certbot certonly --webroot -w $WEBROOT -d example.com -d www.example.com -d sub.example.com
   ```
   certificate name, certificate file and expire time is displayed,
   use privkey.pem as key, cert.pem as certificate and chain.pem as ca
4. use `certbot renew` to renew
5. use `certbot certonly --cert-name domain.com --webroot -w WEBROOT -d domain.com,www.domain.com,ak.domain.com...` to add new domains
6. it seems to have error on http2, change `import http2 from 'http2'` to `import http2 from 'https'` and `createSecureServer` to `createServer` temporarily
7. to backup `/etc/letsencrypt` directory
   ```
   $ tar zcvf /tmp/letsencrypt_backup.tar.gz /etc/letsencrypt
   ```
   to restore backup
   ```
   $ tar zxvf /tmp/letsencrypt_backup.tar.gz -C /
   ```
   `-C` or `--directory` argument value is `/` (the root folder) because previous command uses absolute path by default