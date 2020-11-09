
# Certificate by Let's Encrypt

1. install snap by `apt install snapd`
2. install certbot by `snap install --classic certbot`
3. prepare a webserver where `/.well-known/acme-challenge` is gettable 
   and required domains are accessible (2xx response), then simply run 

    ```
    $ certbot certonly --webroot -w $WEBROOT -d example.com -d www.example.com -d sub.example.com
    ```
   certificate name, certificate file and expire time is displayed,
   use privkey.pem as key, cert.pem as certificate and chain.pem as ca

### BACKUP

    - Congratulations! Your certificate and chain have been saved at:
    /etc/letsencrypt/live/domain.com/fullchain.pem
    Your key file has been saved at:
    /etc/letsencrypt/live/domain.com/privkey.pem
    Your cert will expire on 2021-01-28. To obtain a new or tweaked
    version of this certificate in the future, simply run certbot
    again. To non-interactively renew *all* of your certificates, run
    "certbot renew"