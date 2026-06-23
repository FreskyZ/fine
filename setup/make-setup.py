import io, os, datetime, subprocess, pathlib, tarfile

# *prepare* for setup the project, I mean this run on local
# to make the setup script and setup bundle, not the setup script itself

if not (pathlib.Path() / 'doki').exists():
    print('need doki binary to use in list command and in bundle')
    exit(1)
if 'DOKI_CONFIG' not in os.environ:
    print('need DOKI_CONFIG to use in list command and in bundle')
    exit(1)

def list_objects(prefix):
    command = ['./doki', '--no-implicit-config-hint', 'list', '--prefix', prefix, '--format', 'csv']
    print(f'make-setup.py: run {' '.join(command)}')
    child = subprocess.run(command, capture_output=True)
    stdout = ''
    if child.stdout:
        stdout = child.stdout.decode().strip()
        print('\n'.join([f'  doki: {r.strip()}' for r in stdout.splitlines()]))
    if child.stderr:
        stderr = child.stderr.decode().strip()
        print('\n'.join([f'  doki: {r.strip()}' for r in stderr.splitlines()]))
    if child.returncode:
        print(f'make-setup.py: doki return code {child.returncode}, abort')
        exit(1)
    print(f'make-setup.py: doki return code 0')
    # the ','.join part handles comma inside object path, will that really happen?
    return [pathlib.Path(','.join(record.split(',')[:-2])) for record in stdout.splitlines()]

setup_script = 'set -ex\n'
setup_script += 'mkdir -p images\n./doki -c doki.toml sync oss:images images\n'
for path in list_objects('images'):
    setup_script += f'docker load -i images/{path.name}\n'
setup_script += 'mkdir -p backup\n./doki -c doki.toml sync oss:active backup\n'
for path in list_objects('active'):
    if not path.name.startswith('fine-logs'):
        setup_script += f'docker compose run --rm --name restore1 -v .:/work --entrypoint "python -m tarfile -e /work/backup/{path.name} /" restore\n'
# ATTENTION python -m tarfile -e does not preserve owner?
setup_script += 'docker compose run --rm --name restore1 --entrypoint "chown -R 70:70 /data/base" restore\n'
# now the database setup script will read sql files in backup folder and use that
# # the original restore script use complex check command to confirm database exist and no data exist:
# # psql -U username -Atc "SELECT 1 FROM pg_database WHERE datname='fine'" expect stdout == '1'
# # psql -U username --dbname fine -Atc "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'" expect no stdout
# # psal -U username --dbname fine -f /data/base/fine.sql
# # these are not needed when you regard sql files to be restored as seed data (initial data) in database setup process
setup_script += 'docker compose run --rm --name database1 --entrypoint "sh setup.sh" database'
setup_script += '''
mv fine-dontry.service fine-dontry.timer /etc/systemd/system
mv fine-backup.service fine-backup.timer /etc/systemd/system
'''

backup_service = '''[Unit]
Description = fine backup service

[Service]
Type = oneshot
WorkingDirectory = /work
ExecStart = /usr/bin/python3 /work/backup.py run
'''
backup_service_timer = '''[Unit]
Description = Schedule fine-backup.service

[Timer]
OnCalendar = *-*-* 02:00:00
Persistent = true

[Install]
WantedBy = timers.target
'''
dontry_service = '''[Unit]
Description = setup network filters

[Service]
Type = oneshot
WorkingDirectory = /work
ExecStart = /usr/bin/python3 /work/backup.py nft
'''
# run twice a day to increase responsibility
dontry_service_timer = '''[Unit]
Description = Schedule fine-dontry.service

[Timer]
OnCalendar = *-*-* 02:00:00
OnCalendar = *-*-* 14:00:00
Persistent = true

[Install]
WantedBy = timers.target
'''
# by the way
envrc = '''
alias akari='docker compose run --rm --name akari1 -v .:/self akari'
'''

def add_text_file(f, name, content, mode=0o644):
    info = tarfile.TarInfo(name=name)
    info.size = len(content)
    info.mode = mode
    info.mtime = datetime.datetime.now(datetime.UTC).timestamp()
    f.addfile(info, fileobj=io.BytesIO(content.encode('utf-8')))

# change internal to true for bundled config, or else you lose the free network traffic
with open(os.environ['DOKI_CONFIG']) as f:
    doki_config = f.read()
    if 'internal = false' not in doki_config:
        print('make-setup.py: you seems to forget the whitespaces for internal = false')
    doki_config = doki_config.replace('internal = false', 'internal = true')

with tarfile.open('fine-setup.tar.xz', 'w:xz') as f:
    f.add('docker-compose.yml', 'compose.yml')
    f.add('doki')
    add_text_file(f, 'doki.toml', doki_config)
    f.add('backup.py')
    add_text_file(f, 'fine-backup.service', backup_service)
    add_text_file(f, 'fine-backup.timer', backup_service_timer)
    add_text_file(f, 'fine-dontry.service', dontry_service)
    add_text_file(f, 'fine-dontry.timer', dontry_service_timer)
    add_text_file(f, '.envrc', envrc)
    add_text_file(f, 'fine-setup.sh', setup_script, mode=0o700)
print('make-setup.py: create fine-setup.tar.xz')

# test run
# mkdir testsetup && cd testsetup
# tar xJf fine-setup.tar.xz -C .
# replace compose.yml with a dummy
# services:
#   database:
#     image: fine/database
#     volumes:
#       - database:/var/lib/pgsql
#       - database-backup:/var/lib/pgsql/backup
#   restore:
#     image: python
#     profiles: [backup]
#     volumes:
#       - dummy-data:/data
#       - database-backup:/data/base
# volumes:
#   database:
#     name: testsetup-database
#   database-backup:
#     name: testsetup-database-backup
#   dummy-data:
#     name: testsetup-dummy-data
# networks:
#   default:
#     name: fine1
# change doki.toml back to internal = false
# after complete run
# view files in testsetup-dummy-data
# mount testsetup-database to a fine/database container
# pg_ctl start && psql

# check
# docker images
# docker compose up database
# docker run -it --rm --name program1 -v fine-program:/var/www -v fine-configs:/etc/fine -v certificates:/etc/letsencrypt fine/alpine
# ls -l /var/www
# ls -l /etc/fine
# ls -l /etc/letsencrypt/live
# akari
# connect
# core
# upload setup/docker-compose.yml:/self/compose.yml should show nodiff
# docker compose up web
# visit id.example.com
# docker compose up acme
# python3 backup.py run backup once
# python3 backup.py nft
