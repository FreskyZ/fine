# Certificate Automation

- You should use HTTPS ([Why use HTTPS?](https://www.cloudflare.com/learning/ssl/why-use-https/)).
- HTTPS requires an SSL/TLS certificate ([What is an SSL certificate?](https://www.cloudflare.com/learning/ssl/what-is-an-ssl-certificate/)).
- SSL/TLS certificates must be acquired and periodically renewed, as they have limited validity.

Currently, [Let's Encrypt](https://letsencrypt.org) and its recommended ACME client, [Certbot](https://certbot.eff.org), are used for this process.

## Certification Workflow

### One-Time Setup

1. Install Certbot using `snap install --classic certbot` or follow the instructions at https://certbot.eff.org/.
2. Check if your DNS provider is supported:
   - If Certbot has built-in support, use `certbot --help all` (note: `certbot --help` does not show all plugins).
   - If not, ensure your provider offers a professional API for DNS record management. Prepare `validation.js` and `cleanup.js` in a stable filesystem location.
3. Redirect all domains and subdomains to a single certificate endpoint by adding CNAME records:
   - `_acme-challenge.www.example.com` → `_acme-challenge.example.com`
   - `_acme-challenge.app.example.com` → `_acme-challenge.example.com`
   - `_acme-challenge.example2.com` → `_acme-challenge.example.com`
   - Add CNAME records for any new origins as needed.

### Create Certificate

Use the following command:

```sh
certbot certonly --preferred-challenges dns --manual \
   --manual-auth-hook "node /root/path/to/validation.js" \
   --manual-cleanup-hook "node /root/path/to/cleanup.js" \
   -d example.com
```

- `certonly`: Obtain or renew a certificate without installing it.
- `--preferred-challenges dns`: Use the DNS-01 challenge ([details](https://letsencrypt.org/docs/challenge-types/)).
- `--manual`: Use manual hooks for DNS validation and cleanup.
- `--manual-auth-hook` and `--manual-cleanup-hook`: Paths to your hook scripts.
  If using Node.js with nvm, specify the full path to the Node.js binary and make sure that version
  is not accidentally updated or removed, e.g., `/home/username/.nvm/versions/node/v24.2.0/bin/node /etc/letsencrypt/validation-hooks/validation.js`.
- `-d example.com`: Specify the domain. For multiple domains, repeat the `-d` flag (e.g., `-d example.com -d www.example.com -d api.example.com`).
- Add `--staging` to test the command and validation hooks.

### Renew or Update Certificate

Run `certbot renew` to renew certificates, or use the similar `certbot certonly` command to issue a new or updated certificate.

To revoke a certificate:  
```sh
certbot revoke --cert-name example.com
```

## Backup and Restore

Back up the entire `/etc/letsencrypt` directory. It's also recommended to back up your `validation.js` and `cleanup.js` files. For convenience, store these scripts in a stable location such as `/etc/letsencrypt/validation-hooks`.

To create a backup:

```sh
tar zcvf /tmp/letsencrypt-backup-20250101.tar.gz /etc/letsencrypt
```

To restore from backup:

```sh
tar zxvf /tmp/letsencrypt-backup-20250101.tar.gz -C /
```

The `-C /` option extracts files to their original absolute paths.

To display certificate details similar to a browser's certificate information panel:

```sh
openssl crl2pkcs7 -nocrl -certfile cert.pem | openssl pkcs7 -print_certs -text -noout
```

## Server Side Setup

- The certificate files should be located in `/etc/letsencrypt/live/example.com/` file name `privkey.pem` and `cert.pem`.
- If you are not running web server with root, check permission availability of certificate files from server process.
- Use them in Node.js with `https.createServer` or `http2.createSecureServer`:

```js
https.createServer({
   key: fs.readFileSync('privkey.pem', 'utf-8'),
   cert: fs.readFileSync('cert.pem', 'utf-8')
}, app);
// or
http2.createSecureServer({
   key: fs.readFileSync('privkey.pem', 'utf-8'),
   cert: fs.readFileSync('cert.pem', 'utf-8')
}, app);
```

- For serving multiple certificates for different domains on the same server, use the `SNICallback` option:

```js
// httpsCertificates: { default: { key: string, cert: string }, [domain: string]: { key: string, cert: string } }
const httpsServer = http2.createSecureServer({
   key: httpsCertificates.default.key,
   cert: httpsCertificates.default.cert,
   SNICallback: (servername, callback) => {
      const certificate = httpsCertificates[servername];
      if (certificate) {
         callback(null, tls.createSecureContext({ key: certificate.key, cert: certificate.cert }));
      } else {
         callback(new Error('SNI certificate request not found'));
      }
   },
}, app);
```

## Technology Details

### The ACME Protocol

The `ACME` in `Certbot ACME client` stands for [Automatic Certificate Management Environment](https://en.wikipedia.org/wiki/Automatic_Certificate_Management_Environment),
a protocol for automating certificate management. It was initially developed by Let's Encrypt and later standardized ([RFC 8555](https://datatracker.ietf.org/doc/html/rfc8555/)).

The core of certificate issuance is proving control over a domain. Common validation methods include:

- Receiving a secret via email at admin@example.com and confirming receipt.
- Adding a specific token to your DNS records to prove DNS control.
- Placing a token in a file on your web server to prove server control.

The ACME protocol automates this process by:

- Creating a certificate request.
- Placing the required token in your website content or DNS settings.
- Completing validation and downloading the certificate.
- Optionally installing the certificate on your web server.
- Renewing the certificate automatically before expiration.

and the world become s-er automatically!

### ACME Servers

Let's Encrypt developed the ACME protocol, but there are other ACME server implementations.
For example, the other ACME client [acme.sh](https://github.com/acmesh-official/acme.sh) defaults to using ZeroSSL.

ZeroSSL advertises its advantages over Let's Encrypt ([comparison](https://help.zerossl.com/hc/en-us/articles/17864245480093-Advantages-over-Using-Let-s-Encrypt)),
I almost believed that, until I opened the [pricing](https://zerossl.com/pricing/) page to realize that...

> ZeroSSL: The cost of *zero*ssl is not zero cost.
> (by deepseek) ZeroSSL: Where the 'zero' stands for 'zero dollars left in your wallet.'
> (by deepseek) Turns out, with ZeroSSL, Zero != Free. Who knew?

and they are paying acme.sh to default recommend that

- The free plan allows only 3 certificates (each valid for 3 months).
- No support for SAN (multiple domain) certificates and wild card certificates while Let's Encrypt support that without charge.
- Stricter numeric limits than [Let's Encrypt's rate limits](https://letsencrypt.org/docs/rate-limits/).

Given these restrictions, Let's Encrypt remains the preferred choice for free, automated certificate management.

### Validation Hooks

Certbot documentation lacks examples for the `--manual-auth-hook` parameter.
While [acme.sh's DNS-API Dev Guide](https://github.com/acmesh-official/acme.sh/wiki/DNS-API-Dev-Guide) provides guidance,
it focuses on shell scripts, as acme.sh is implemented entirely in shell. This may explain why Certbot-related documentation
also demonstrates shell scripts for validation hooks.

However, shell scripting is not ideal for complex tasks. Since Aliyun DNS primarily offers SDKs (not a simple HTTP API),
Node.js is a more robust choice for implementing validation hooks. Testing confirms that Certbot supports any executable
as a hook, including Node.js scripts.

To set up Aliyun DNS for certificate automation, follow these steps:

1. In the RAM console, create a new RAM user and save the access key.
2. Create a permission policy allowing only DNS record operations.
3. Attach the policy to the user.

API references:
- [AddDomainRecord](https://help.aliyun.com/zh/dns/api-alidns-2015-01-09-adddomainrecord)
- [DeleteDomainRecord](https://help.aliyun.com/zh/dns/api-alidns-2015-01-09-deletedomainrecord)
- [DescribeDomainRecords](https://help.aliyun.com/zh/dns/api-alidns-2015-01-09-describedomainrecords)

and the validation.js and cleanup.js implementation

```js, validation.js
// packages
// "@alicloud/alidns20150109": "^3.4.9",
// "@alicloud/credentials": "^2.4.3",
// "@alicloud/openapi-client": "^0.4.14",
// "@alicloud/tea-util": "^1.4.10"
import { Config as ClientConfig } from '@alicloud/openapi-client';
import Credential, { Config as CredentialConfig } from '@alicloud/credentials';
import Alidns, { AddDomainRecordRequest } from '@alicloud/alidns20150109';

// official demo code
// https://next.api.aliyun.com/api-tools/sdk/Alidns?version=2015-01-09&language=typescript-tea&tab=primer-doc

// the demo is very java and very not nodejs and typescript,
// by the way, the python demo is also very java and not very python,
// so this implementation removes the meaningless class, class static method and class static main
// but are still forced to new several *real javascript class* variables as options,
// which in nodejs and typescript, should use type constrained plain object while to make things worse,
// the too-java sdk and lack of typescript knowledge make EXACTLY EVERYHING NOT typescript inferrable

// ATTENTION as part of exactly everyhing, you need the .default to find the actually default exported
// class constructor, which precisely abandon all type information at both parameter side and return value side
const credential = new Credential.default(new CredentialConfig({
    // these does not have interface type, you need to f12 the CredentialConfig class to find the property names
    type: 'access_key',
    // the real implementation use hardcode secret,
    // because the script itself is really secret to be only runnable and not frequently run on server
    accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID,
    accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET,
}));
// same issue as above
const client = new Alidns.default(new ClientConfig({
    // same issue as above
    credential,
    endpoint: 'alidns.cn-shanghai.aliyuncs.com',
}));

// certbot provides several environment variables
// CERTBOT_DOMAIN is the domain to be validated, in theory you should invoke api to attach the token
// to _acme-challenge. prefixed domain, but I'm pointing all domains to the same validation endpoint so no use
// console.log('CERTBOT_DOMAIN', process.env.CERTBOT_DOMAIN);

// this is the value to be appear in DNS record
const token = process.env.CERTBOT_VALIDATION;
if (!token) {
    console.error('validation.js: environment variable CERTBOT_VALIDATION missing');
    process.exit(1);
}
console.log(`validation.js: token ${token}`);

try {
    // same issue as before
    const response = await client.addDomainRecord(new AddDomainRecordRequest({
        // same issue as before
        domainName: 'example.com',
        RR: '_acme-challenge',
        type: 'TXT',
        value: token,
    }));
    console.log(`validation.js: token ${token} api add complete record id ${response.body.recordId}`);
} catch (err) {
    console.error(`validation.js: token ${token} failed to add domain record`, err);
    process.exit(1);
}

let ok = false;
let delay = 1000;
do {
    if (delay > 60000) {
        console.error(`validation.js: token ${token} check DNS query result not found for more than 1 minute, abort checking`);
        break;
    }
    await new Promise(resolve => setTimeout(resolve, delay));

    console.log(`validation.js: token ${token} checking DNS query result`);
    // google public DNS https://developers.google.com/speed/public-dns/docs/doh/json
    // UPDATE: google public DNS is not available, use aliyun public DNS https://alidns.com/articles/6018321800a44d0e45e90d71
    const response = await fetch('https://dns.alidns.com/resolve?name=_acme-challenge.example.com&type=TXT');
    if (!response.ok) {
        console.error(`validation.js: token ${token}, failed to call dns.alidns.com (really?), abort checking`, response);
        break;
    }
    const responseData = await response.json();
    ok = (responseData.Answer || []).some(a => a.type == 16 && a.data.replace(/^"|"$/g, '') == token);

    if (ok) {
        console.log(`validation.js: token ${token} check DNS query result success`);
    } else {
        console.log(`validation.js: token ${token} check DNS query result not yet success`, responseData);
        delay *= 2;
    }
} while (!ok);

// wait yet another several seconds considering differences between this machine and letsencrypt's machines
// the number is chosen arbitrarily, if you see this in a github repository it means this number works for me for now
await new Promise(resolve => setTimeout(resolve, 10000));
```

```js, cleanup.js
import { Config as ClientConfig } from '@alicloud/openapi-client';
import Credential, { Config as CredentialConfig } from '@alicloud/credentials';
import Alidns, { DescribeDomainRecordsRequest, DeleteDomainRecordRequest } from '@alicloud/alidns20150109';

const credential = new Credential.default(new CredentialConfig({
    type: 'access_key',
    accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID,
    accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET,
}));
const client = new Alidns.default(new ClientConfig({
    credential,
    endpoint: 'alidns.cn-shanghai.aliyuncs.com',
}));

const token = process.env.CERTBOT_VALIDATION;
if (!token) {
    console.error('cleanup.js: environment variable CERTBOT_VALIDATION missing');
    process.exit(1);
}
console.log(`cleanup.js: token ${token}`);

// need to list the records to find the record id to delete
/** @type {{ recordId: string, value: string }[]} */
let records;
try {
    const recordsResponse = await client.describeDomainRecords(new DescribeDomainRecordsRequest({
        domainName: 'example.com',
        type: 'TXT',
        RRKeyword: '_acme-challenge',
        searchMode: 'COMBINATION',
    }));
    records = recordsResponse.body.domainRecords.record;
} catch (err) {
    console.warn(`cleanup.js: token ${token} failed to get records, no cleanup performed`, err);
    process.exit();
}

const record = records.find(r => r.value == token);
if (!record) {
    console.warn(`cleanup.js: token ${token} not found related records, no cleanup performed`);
    process.exit();
}

console.log(`cleanup.js: token ${token} removing record id ${record.recordId}`);
try {
    await client.deleteDomainRecord(new DeleteDomainRecordRequest({
        recordId: record.recordId,
    }));
    console.log(`cleanup.js: token ${token} remove complete`);
} catch (err) {
    console.error(`cleanup.js: token ${token} failed to delete record, please check manually`, err);
}
```

### WSL Setup

connect to HTTPS on my local WSL dev environment fails on ssl ???
curl: (60) SSL certificate problem: unable to get local issuer certificate ???

export the full chain cert in browser (select full chain in the Windows save as modal) as example.com.crt
put it in /usr/local/share/ca-certificates/ (need sudo, may be need apt install ca-certificates)
run sudo update-ca-certificates

now curl works, to make node work, run node --use-system-ca, or use this

```js
// ???
const mycert = await fs.readFile('my.crt', 'utf-8');
const originalCreateSecureContext = tls.createSecureContext;
tls.createSecureContext = options => {
    const originalResult = originalCreateSecureContext(options);
    if (!options.ca) { originalResult.context.addCACert(mycert); }
    return originalResult;
};
```

don't forget append multiple question marks

this seems is not public api, this is learned from https://github.com/fujifish/syswide-cas/blob/master/index.js

### Story

At first, I bought a domain on GoDaddy because it didn't require beian. As part of reviving this project,
I spun up a temporary file-serving web server and ran the same certificate creation and renewal commands I'd used for years.

But this time, Let's Encrypt kept throwing mysterious validation errors—errors I hadn't seen before,
and certainly not ones caused by my source code, domain, or DNS settings. To make matters worse,
browsers would always auto-redirect to HTTPS and throw certificate errors, even though I hadn't set
that up. Strangely, `curl` worked perfectly for HTTP GET requests, returning file content without issue.

Frustrated, I scrolled through GoDaddy's website—enduring oversized buttons, excessive whitespace,
and a surprising lack of real functionality. It became clear that not all service providers operate
at the same professional level. So, I started exploring alternatives.

For years, I'd relied on the HTTP-based challenge type for certificate validation. But now, I discovered
there was a DNS-based approach and another ACME client: acme.sh. After reading acme.sh's [documentation](https://github.com/acmesh-official/acme.sh/wiki),
I tried using the DNS challenge type, only to find GoDaddy's DNS management page equally lacking
in features—and, for some reason, barely usable in my network environment.

That's when I stumbled upon [acme.sh's DNS alias mode](https://github.com/acmesh-official/acme.sh/wiki/DNS-alias-mode),
which, in theory, lets you redirect DNS validation to a more professional DNS provider. I set up test
scripts for Aliyun's DNS API, and things started to click. I also discovered extra help
in `certbot --help all` and the official Let's Encrypt documentation.

After some trial and error, I tested the full process using Certbot with custom validation hooks.
Finally, everything worked—and the whole certificate automation workflow came together.
