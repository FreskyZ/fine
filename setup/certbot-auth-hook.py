#!/usr/local/bin/python
import os, json, time, pathlib, yaml, urllib.request, dns.resolver

# certbot auth and cleanup hooks for cloudflare DNS api with respect of DNS CNAME alias

if 'CERTBOT_DOMAIN' not in os.environ:
    print('auth.py: missing env var CERTBOT_DOMAIN, when will this happen?')
    exit(1)
if 'CERTBOT_VALIDATION' not in os.environ:
    print('auth.py: missing CERTBOT_VALIDATION, when will this happen?')
    exit(1)

# the domain, this does not include _acme-challenge. prefix
input_domain = os.environ['CERTBOT_DOMAIN']
challenge_input_domain = f'_acme-challenge.{input_domain}'
# the text value expected in domain
input_validation_value = os.environ['CERTBOT_VALIDATION']
print(f'auth.py: receive CERTBOT_DOMAIN={input_domain} CERTBOT_VALIDATION={input_validation_value}')
# use this to determine whether is auth or cleanup
# see https://eff-certbot.readthedocs.io/en/stable/using.html#pre-and-post-validation-hooks
is_cleanup = 'CERTBOT_AUTH_OUTPUT' in os.environ
auth_output = os.environ['CERTBOT_AUTH_OUTPUT'] if is_cleanup else ''
if is_cleanup:
    print('auth.py: cleanup mode, auth output:')
    for line in auth_output.splitlines():
        print(f'  > {line}')

if 'FINE_CONFIG_DIR' not in os.environ:
    print('auth.py: missing FINE_CONFIG_DIR, don\'t forget to set var if you are manual testing')
    exit(1)
config_path = pathlib.Path(os.environ['FINE_CONFIG_DIR'])

# example read result
# {'cloudflare-api-token': '?'}
if not (config_path / 'certbot.yml').exists():
    print('auth.py: not found certbot.yml, you may forget to map')
    exit(1)
with open(config_path / 'certbot.yml') as f:
    api_token = yaml.load(f, Loader=yaml.CLoader)['cloudflare-api-token']
if not api_token:
    print('auth.py: missing cloudflare api token, is certbot.yml correct?')
    exit(1)

# example read result
# {'example.com': {'wildcard': True}, 'example-2.com': {'alias': True, 'wildcard': True}, 'short-example.com': None}
if not (config_path / 'domains.yml').exists():
    print('auth.py: not found domains.yml, you may forget to map')
    exit(1)
with open(config_path / 'domains.yml') as f:
    config_domains = yaml.load(f, Loader=yaml.CLoader)

if input_domain not in config_domains:
    print(f'auth.py: input domain {input_domain} not found in config, when will this happen?')
    exit(1)
is_alias = config_domains[input_domain] is not None and 'alias' in config_domains[input_domain]
if is_alias:
    print('auth.py: alias mode')

if is_alias:
    ALIAS_TARGET_PREFIX = 'auth.py: alias target: '
    if not is_cleanup:
        # resolve alias
        # 1. dig vs dnspython
        #    - this download about 15mb: apk add bind-tools && dig +short f'_acme-challenge.example.com' CNAME
        #    - this download about 400kb: pip install dnspython
        # 2. api reference
        #    # by the way, not useful python REPL does not print object owned properties,
        #    # it prints a <xxobject> when no __str__ or __repr__ is implemented, you need to dir(theobject) and manually .prop
        #    - the function https://dnspython.readthedocs.io/en/latest/resolver-functions.html#dns.resolver.resolve
        #    - say see parameters in https://dnspython.readthedocs.io/en/latest/resolver-class.html#dns.resolver.Resolver.resolve
        #    - return type https://dnspython.readthedocs.io/en/latest/resolver-class.html#dns.resolver.Answer
        #    - main property .rrset type https://dnspython.readthedocs.io/en/latest/rdata-set-classes.html#dns.rrset.RRset
        #    - RRset type inherit from https://dnspython.readthedocs.io/en/latest/rdata-set-classes.html#dns.rdataset.Rdataset
        #    - is a set (iterable) of https://dnspython.readthedocs.io/en/latest/rdata-class.html#dns.rdata.Rdata
        #      call .to_text(), convert it to '_acme-challenge.notcf-example.com.cf-example.com.' attention the ending period
        #    - the rdata object is actually https://dnspython.readthedocs.io/en/latest/rdata-subclasses.html#dns.rdtypes.ANY.CNAME.CNAME
        #    - which have a .target property with type https://dnspython.readthedocs.io/en/latest/name-class.html#dns.name.Name
        #      use to_text(omit_final_dot=True) to omit final dot
        try:
            answer = dns.resolver.resolve(challenge_input_domain, 'CNAME')
        except dns.resolver.NoAnswer:
            print(f'auth.py: no CNAME answer found for {challenge_input_domain}, check your DNS setup')
            exit(1)
        except Exception as ex:
            print(f'auth.py: resolve DNS alias raise unexpected error', ex)
            exit(1)
        # operating name: operating record's name
        operating_name = [rdata.target.to_text(omit_final_dot=True) for rdata in answer.rrset][0]
        # operating domain: the second level domain that managed by cloudflare
        operating_domain = '.'.join(operating_name.split('.')[-2:])
        print(f'auth.py: alias from {challenge_input_domain} to {operating_name} domain {operating_domain}')
        print(f'{ALIAS_TARGET_PREFIX}{operating_name}') # cleanup read
    else: # is cleanup
        matches = [r[len(ALIAS_TARGET_PREFIX):].strip() for r in auth_output.splitlines() if r.startswith(ALIAS_TARGET_PREFIX)]
        if not len(matches):
            print('auth.py cleanup mode: not found alias target in auth output')
            exit(1)
        operating_name = matches[0]
        operating_domain = '.'.join(operating_name.split('.')[-2:])
        print(f'auth.py cleanup mode: alias target {operating_name} domain {operating_domain}')
else:
    operating_name = challenge_input_domain
    operating_domain = input_domain

# action_name is for print, method is 'GET' | 'POST' | 'DELETE', data is the dict
# return response object result object
def request(action_name: str, method: str, url: str, data: dict=None):
    data = json.dumps(data).encode('utf-8') if data is not None else None
    with urllib.request.urlopen(urllib.request.Request(url, method=method, data=data, headers={
        # note this is python dict not js arbitrary object, string keys must quote
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {api_token}',
    })) as response:
        # according to cloudflare api reference, response is always 200
        if (response.status != 200):
            print(f'auth.py: {action} response status not 200', response)
            exit(1)
        try:
            response_data = json.loads(response.read().decode('utf-8'))
        except Exception as ex:
            print(f'auth.py: {action} response failed to parse?', ex, response)
            exit(1)
        if 'result' not in response_data:
            print(f'auth.py: {action} response unknown structure?', response_data)
        return response_data['result']

ZONE_ID_PREFIX = 'auth.py: zone id: '
if not is_cleanup:
    # https://developers.cloudflare.com/api/resources/zones/methods/list return { id: string, name: string }[]
    zones_result = request('list zones', 'GET', 'https://api.cloudflare.com/client/v4/zones')
    zone_ids = [z['id'] for z in zones_result if z['name'] == operating_domain]
    if not len(zone_ids):
        print(f'auth.py: operating domain {operating_domain} not found in list zone result, the world may be collapse!')
        exit(1)
    zone_id = zone_ids[0]
    print(f'auth.py: zone id: {zone_id}') # cleanup read
else:
    matches = [r[len(ZONE_ID_PREFIX):].strip() for r in auth_output.splitlines() if r.startswith(ZONE_ID_PREFIX)]
    if not len(matches):
        print('auth.py cleanup mode: not found zone id in auth output')
        exit(1)
    zone_id = matches[0]
    print(f'auth.py cleanup mode: zone id: {zone_id}')

# enable this exit() and test prepare part
# CERTBOT_DOMAIN=example.com CERTBOT_VALIDATION=somerandomhash FINE_CONFIG_DIR=/etc/fine /auth.py
# CERTBOT_DOMAIN=alias-example.com CERTBOT_VALIDATION=somerandomhash FINE_CONFIG_DIR=/etc/fine /auth.py
# echo 'not important content' > /auth-output.txt
# echo 'auth.py: alias target: _acme-challenge.alias-example.com.example.com' >> /auth-output.txt
# echo 'not important content v2' >> /auth-output.txt
# echo 'auth.py: zone id: somerandomhas' >> /auth-output.txt
# IFS= read -r -d '' CERTBOT_AUTH_OUTPUT </auth-output.txt
# CERTBOT_DOMAIN=example.com CERTBOT_VALIDATION=somerandomhash CERTBOT_AUTH_OUTPUT=$CERTBOT_AUTH_OUTPUT /auth.py
# CERTBOT_DOMAIN=alias-example.com CERTBOT_VALIDATION=somerandomhash CERTBOT_AUTH_OUTPUT=$CERTBOT_AUTH_OUTPUT /auth.py
# exit()

RECORD_ID_PREFIX = 'auth.py: record id: '
if not is_cleanup:
    # https://developers.cloudflare.com/api/resources/dns/subresources/records/methods/create
    result = request('create record', 'POST', f'https://api.cloudflare.com/client/v4/zones/{zone_id}/dns_records', {
        'name': operating_name,
        'type': 'TXT',
        'content': f'"{input_validation_value}"',
    })
    if 'id' not in result:
        print('auth.py: create record result unkwon structure', result)
        exit(1)
    print(f'{RECORD_ID_PREFIX}{result['id']}')
    # 30s works for now,
    # although default ttl is 10 minutes, current anycast dns should be very fast # but 10s does not work, so use 30
    time.sleep(30)
else: # cleanup
    matches = [r[len(RECORD_ID_PREFIX):].strip() for r in auth_output.splitlines() if r.startswith(RECORD_ID_PREFIX)]
    if not len(matches):
        print('auth.py cleanup mode: not found record id in auth output')
        exit(1)
    record_id = matches[0]
    print(f'auth.py cleanup mode: record id: {record_id}')
    # https://developers.cloudflare.com/api/resources/dns/subresources/records/methods/delete
    result = request('delete record', 'DELETE', f'https://api.cloudflare.com/client/v4/zones/{zone_id}/dns_records/{record_id}')
    print('auth.py cleanup mode: complete delete:', result)
