# Automatic Certificate Management

- first, you need HTTPS, https://www.cloudflare.com/learning/ssl/why-use-https
- then, HTTPS need SSL/TLS certificate, https://www.cloudflare.com/learning/ssl/what-is-an-ssl-certificate
- SSL/TLS certificate need to be acquired follow specific process and renewed before expiration
- Let's Encrypt https://letsencrypt.org/ supports automate certificate management based on ACME protocol
  https://datatracker.ietf.org/doc/html/rfc8555/, with help of its ACME client, certbot https://certbot.eff.org

## Certificate Workflow

install certbot according to instructions https://certbot.eff.org/instructions

### Challenge Types

there are 2 major challenge types https://letsencrypt.org/docs/challenge-types/, use DNS-01 because

- I'm not using normal web server
- it will be complex to contact web server (put a file or call nginx reload, etc.) in containerized environment,
  while the DNS-01 type works as long as you have access to letsencrypt.org and your dns service provider api,
  which really fits in the isolation model of containerization

### Commands

```sh
# certonly: acquire certificate
# --preferred-challenges: use DNS-01 challenge type
# --dns-cloudflare: use cloudflare dns api
# --dns-cloudflare-credentials: api key file,
#     see more at https://certbot-dns-cloudflare.readthedocs.io/en/stable/
#     other dns plugin have their own parameters and setups
# -d: domains, use multiple -d for multiple domains, support wildcard domain,
#    when using wildcard domain, don't forget that *.example.com does not cover example.com itself,
#    you need -d *.example.com -d example.com for that
# --staging: use this at developing/configuring stage
certbot certonly --preferred-challenges dns \
    --dns-cloudflare --dns-cloudflare-credentials cloudflare.ini \
    -d example.com --staging

# or acquire certificate with custom validation hooks
# --manual: not use builtin dns api plugins
# --manual-auth-hook: called before authentication,
#     add TXT DNS record to CERTBOT_DOMAIN with value CERTBOT_VALIDATION
#     see https://eff-certbot.readthedocs.io/en/stable/using.html#pre-and-post-validation-hooks
#     also can see https://github.com/acmesh-official/acme.sh/wiki/DNS-API-Dev-Guide
#     by the way, node nvm does not work well here, you need something like
#     /home/username/.nvm/versions/node/v24.2.0/bin/node /etc/letsencrypt/validation-hooks/validation.js
# --manual-cleanup-hook: called after authentication, cleanup your dns record
# --deploy-hook: instruct web server to restart or reload certificate
certbot certonly --preferred-challenges dns --manual \
    --manual-auth-hook 'node validation.js' \
    --manual-cleanup-hook 'node cleanup.js' \
    --deploy-hook 'node reload-server.js' \
    -d example.com --staging

# when install with snap,
#   certbot will automatically setup cron or systemd-timer to schedule renew,
#   check by crontab -l or systemctl status snap.certbot.renew.timer, or find the name by systemctl list-timers,
# manually use this command to trigger renew if letsencrypt think it's appropriote time
#   most of the time this will skip most certificates because they are not yet due for renew
# staging environment should use with --staging
# container entrypoint should invoke this command periodically or setup timers to invoke this command
certbot renew

# revoke
# cert name is by default the domain name, or the --cert-name you explicitly specified in certonly command
# don't forget to revoke staging certificate with --staging after testing
certbot revoke --cert-name example.com

# check certificate information
certbot certificates
openssl crl2pkcs7 -nocrl -certfile /etc/letsencrypt/live/example.com/cert.pem | openssl pkcs7 -print_certs -text -noout

# if you are told that web server should be run as non root user,
# don't forget to give web server process priviledge to access the files in deploy hook
sudo chown -R 1000:1000 /etc/letsencrypt/live/example.com
sudo chown -R 1000:1000 /etc/letsencrypt/archive/example.com

# backup
# no -C because the backup and restore location is always /etc/letsencrypt
tar cJf letsencrypt-backup-20250101.tar.xz /etc/letsencrypt
# restore
tar xJf letsencrypt-backup-20250101.tar.xz -C /
```

### Server Side Setup

```javascript
// create server
https.createServer({ key: fs.readFileSync('privkey.pem'), cert: fs.readFileSync('cert.pem') }, app);
// or
http2.createSecureServer({ key: fs.readFileSync('privkey.pem'), cert: fs.readFileSync('cert.pem') }, app);

// if have difference certificates for multiple domains, use SNI callback
// httpsCertificates: { default: { key: string, cert: string }, [domain: string]: { key: string, cert: string } }
const httpsServer = http2.createSecureServer({
   key: httpsCertificates.default.key,
   cert: httpsCertificates.default.cert,
   SNICallback: (servername, callback) => {
      // TODO match wildcard
      const certificate = httpsCertificates[servername];
      if (certificate) {
         callback(null, tls.createSecureContext({ key: certificate.key, cert: certificate.cert }));
      } else {
         callback(new Error('SNI certificate request not found'));
      }
   },
}, app);
```

### Certificate Authorities

if you check https://letsencrypt.org/docs/client-options and click into
acme.sh https://github.com/acmesh-official/acme.sh and find its sponsor zerossl certificate authority,

> with claiming that acme.sh is the #1 acme client?
> acme protocol is created and improved by let's encrypt and electronic frontier foundation
> (the eff in certbot's url certbot.eff.org) but acme.sh is claiming it's #1?

and then misled by its advertisement and its comparison document
https://help.zerossl.com/hc/en-us/articles/17864245480093-Advantages-over-Using-Let-s-Encrypt,
you can open it's pricing page and find out that the free account has far less functionality
and is far more restricted than letsencrypt completely free features, so

*zerossl is not zero cost*

after the finding you can review the comparison document again and can find that longer certificate lifetime
is not an advantage and is avoided by letsencrypt, email validaiton is against automation, webapp integration
is against automation, these incorrect advertisement wording together with the shameless claims may help you
understand more how evil is commercial groups and how good is letsencrypt and eff.

by the way, letsencrypt and eff created https://datatracker.ietf.org/doc/html/rfc9773/ ACME renewal information
specification to help schedule renewal operations and mitigate issues from shortening certificate lifetime

## Containerization

use official image certbot/certbot,
see https://eff-certbot.readthedocs.io/en/latest/install.html#alternative-1-docker

by the way, container appraoch is not listed in https://certbot.eff.org/instructions,
why is this installation instructions not include docker but include some not very relavent things?

### DNS Plugin

I use some domains from aliyun domain registrar, this dns provider is
not supported in builtin plugin list, so I was developing a nodejs script as hooks
in manual dns plugin https://eff-certbot.readthedocs.io/en/latest/using.html#manual

- which is written in nodejs and need to install node, while I currently don't know how to install bare nodejs
  in linux? actually nodejs official document also only provides nvm instructions or nvm-like tools except use
  container, oh, ai says use apt install nodejs, ok.
- on the other hand, if you try to install certbot in a nodejs image, you need use snap or pip, while pip is
  discouraged in https://eff-certbot.readthedocs.io/en/latest/install.html#alternative-2-pip, snap is one of
  the (not major) reasons that I switch from ubuntu to debian in some environments
- certbot is a python program, to avoid install nodejs and python in the same container, you need to rewrite the
  script in python, the uv project file structure is more complex than npm projects, you need to investigate which
  files to exclude while backing up /etc/letsencrypt together with hooks, and python is missing builtin high level
  http client library support (why is requests still a 3rd party library?) and similar asyncio support like nodejs,
  all of these will make developing experience and efficiency worse than nodejs
- the validation hooks depends on aliyun official dns sdk, which is a complete piece of *shit*,
  you can blame this section to find the old script content,
  it looks like "const credential = new Credential.default(new CredentialConfig({ ... }));"
  - why is there a new? normal data objects should use plain objects instead of new
  - why is there a .default? this have serious bundling issues that happen in 2025?
  - and this .default make the type definitions complete not working,
    as they only work on not .default version, so you get a non typed large library in 2025?  
  and "try { const response = await client.addDomainRecord(new AddDomainRecordRequest({ ... })) }"
  - why is there so many news?
  - why is there so many dedicated real class names? (real function objects in runtime compare to typescript types)
  - why is this using try catch and don't know the error object type?
- the sdk wraps aliyun dns api which uses a signing mechanism which is a complete piece of *shit*,
  described at https://help.aliyun.com/zh/sdk/product-overview/v3-request-structure-and-signature#c1aca127aeru1,
  implemented at https://github.com/aliyun/darabonba-openapi/blob/master/python/alibabacloud_tea_openapi/client.py,
  or https://github.com/aliyun/darabonba-openapi/blob/master/ts/src/utils.ts#L881,
  which is completely different from modern authentication scheme that use http request header authorization to
  send a bearer token, to make it worse, this sdk source code is
  - using class static method? why do you need class static method in js?
  - and var? I mean, you sometimes find old js projects in github using var,
    but you really cannot easily find old but new projects in github using var and typescript type at same time?
  - both python and typescript source code don't have any comment in the source code, I mean, too many AI style
    comment is bad, but no comment also indicates the code quality problem

with this background it seems unforturnate that I have to discard aliyun sdk and implement the signing mechanism
on my own reading the poor documents and very poor official implementations, and I even consider riir because write
the numeric operations in hash algorithms used in this signing mechanism in python has bad performance, and directly
talk to acme protocol to avoid the redundant part in certbot like http challegent type and other dns plugins...

and there comes **DNS Alias Mode**! https://github.com/acmesh-official/acme.sh/wiki/DNS-alias-mode

a DNS CNAME (canonical name) record acts as an alias, mapping one domain name to another (the canonical domain),
this is not an acme.sh feature, and is not a certbot feature, and is not a letsencrypt and ACME protocol feature,
it is a DNS feature, in DNS specification https://datatracker.ietf.org/doc/html/rfc1034#section-3.6.2, in 1987.
in 1987. this is normally used for redirecting to A records, but also valid for TXT records

with this feature, you can redirect aliyun domain to a specific cloudflare dns record,
e.g. make _acme-challenge.aliyun-example.com redirect to _acme-challenge.aliyun-example.com.cloudflare-example.com,
and manipulate TXT record with cloudflare api to complete the authentication part

follow CNAME record is not supported by builtin dns plugins
(this may be the reason why this feature is not mentioned in letsencrypt and certbot documents),
but cloudflare api is very *normal*, it is easy to implement in python without 3rd party libraries,
the authentication process involves a sequence of 2 or 3 network access, no need to use asyncio

by the way, I was using godaddy domains for sometime, web interface and api functionality of this dns registrar
is also kind of shit (this is actually implied when I see really many advertisements from godaddy in youtube),
that's why I discovered and use DNS alias mode in old days

### Renewal

the document does not talk about renewal setup
in https://eff-certbot.readthedocs.io/en/latest/install.html#alternative-1-docker

the short answer is, the certbot official docker image does **NOT** include automatic renewal setup

it is discovered by

- while systemd is not available in container, there is no item in crontab -l that looks like certbot after
  certonly --staging command in container
- the command in container has output shows NEXT STEPS:
  The certificate will need to be renewed before it expires. Certbot can automatically renew the certificate in
  the background, but you may need to take steps to enable that functionality. See https://certbot.org/renewal-setup
  for instructions, this document link start with "If you think you may need to set up automated renewal", which
  indicates that certbot cli think I may need to setup renewal schedule
- https://github.com/certbot/certbot/blob/main/snap/snapcraft.yaml#L45-49 have a timer, and according
  to https://snapcraft.io/docs/reference/development/yaml-schemas/the-snap-format/ it *is* the timer setup,
  which means certbot itself may not setup on its own, but instruct snapd to do so
- search the codebase using cron https://github.com/search?q=repo%3Acertbot%2Fcertbot%20cron&type=code
  or systemd https://github.com/search?q=repo%3Acertbot%2Fcertbot%20systemd&type=code shows no actual code is
  calling cron or systemd commands or functions to setup the periodic job
- a packaging document https://eff-certbot.readthedocs.io/en/latest/packaging.html#notes-for-package-maintainers
  says "If you’d like to include automated renewal in your package" indicates the official pip package does not
  include automatic renewal
- installation instructions for snap https://certbot.eff.org/instructions?ws=other&os=snap only talk about "Test
  automatic renew", but no "setup automatic renew", while for pip https://certbot.eff.org/instructions?ws=other&os=pip
  it has a section "Set up automatic renew", by the way, macos also need manual setup, but windows don't

so it is believed that official docker image and pip installed certbot does not automatically setup renewal, and this
is also the answer to "what do I put in docker container's entrypoint/command", you should run certbot renew or setup
periodic job to run certbot renew in a renewal container

also, common tutorials to run certbot renew in exact time point of the day is not recommended by letsencrypt, this
will cause thousands of or millions of services connecting acme server at the same time, reducing service quality at
both end, certbot snap package is setting up 00:00~24:00/2, the tilde means twice a day at random time,
see https://snapcraft.io/docs/reference/administration/timer-string-format/, the pip installation instruction is
using echo "0 0,12 * * * ... time.sleep(random.random() * 3600)' && certbot renew -q" which means random minute at
hour 0 or hour 12, I'm following snap setup, select a random time in each half of a utc day

see setup/certbot-entrypoint.py, by the way, random time is easy, fail safe is not easy
