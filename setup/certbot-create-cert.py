#!/usr/local/bin/python
import os, sys, pathlib, yaml, json

dry = len(sys.argv) > 1 and sys.argv[1] == '--dry'
print(f'create.py: creating certificates{' (dry)' if dry else ''}')

if 'FINE_CONFIG_DIR' not in os.environ:
    print('create.py: missing FINE_CONFIG_DIR, don\'t forget to set var if you are manual testing')
    exit(1)
config_path = pathlib.Path(os.environ['FINE_CONFIG_DIR'])
if not (config_path / 'domains.yml').exists():
    print('create.py: not found domains.yml, you may forget to map')
    exit(1)
with open(config_path / 'domains.yml') as f:
    config_domains = yaml.load(f, Loader=yaml.CLoader)

for domain, info in config_domains.items():
    info = info if info else {}
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
        # NOTE ATTENTION add in dev environment and ATTENTION remove in production environment
        #      both side is attention
        # '--staging',
        # disable prompt
        '--agree-tos',
        # disable prompt for email, the eamil feature is already not used by letsencrypt
        # https://letsencrypt.org/2025/01/22/ending-expiration-emails
        '-m example@outlook.com',
        '--non-interactive',
    # # oh, this is your spread
    ] + domain_parameters
    if len(sys.argv) > 1 and sys.argv[1] == '--dry':
        print(' '.join(parameters))
    else:
        child = subprocess.run(parameters, check=True)
        print(f'create.py: certbot command exited with return code {child.returncode}')
        if child.returncode:
            exit(child.returncode)
print(f'create.py: {'check' if dry else 'create or update'} {len(config_domains)} certificates')
