#!/usr/local/bin/python
import os, sys, json

dry = len(sys.argv) > 1 and sys.argv[1] == '--dry'
print(f'create.py: creating certificates{' (dry)' if dry else ''}')
if not os.path.exists('/etc/fine/config.json'):
    print('create.py: not found /etc/fine/config.json, you may forget to map')
    exit(1)
with open('/etc/fine/config.json') as f:
    config = json.load(f)
for domain, info in config['certificates'].items():
    is_wildcard = 'wildcard' in info and info['wildcard']
    include_www = 'www' in info and info['www']
    print(f'create.py: {domain}{', wildcard' if is_wildcard else ''}{', www' if include_www else ''}')
    domain_parameters = ['-d', domain]
    if is_wildcard:
        domain_parameters += ['-d', f'*.{domain}']
    elif include_www: # elif: wildcard covers www
        domain_parameters += ['-d', f'www.{domain}']
    parameters = [
        'certbot',
        'certonly',
        '--preferred-challenges', 'dns',
        '--manual',
        '--manual-auth-hook', '/auth.py',
        '--manual-cleanup-hook', '/auth.py',
    # # oh, this is your spread
    ] + domain_parameters + [
        # NOTE ATTENTION add in dev environment and ATTENTION remove in production environment
        #      both side is attention
        # '--staging',
        # disable prompt
        '--agree-tos',
        # disable prompt for email, the eamil feature is already not used by letsencrypt
        # https://letsencrypt.org/2025/01/22/ending-expiration-emails
        '-m example@outlook.com',
        '--non-interactive'
    ]
    if len(sys.argv) > 1 and sys.argv[1] == '--dry':
        print(' '.join(parameters))
    else:
        child = subprocess.run(parameters, check=True)
        print(f'create.py: certbot command exited with return code {child.returncode}')
        if child.returncode:
            exit(child.returncode)
print(f'create.py: {'check' if dry else 'create or update'} {len(config['certificates'])} certificates')
