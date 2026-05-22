#!/usr/local/bin/python -u
#                  NOTE ^^ this -u is for unbufferred output, which is required if you want to docker logs python entrypoint print output
import os, datetime, tarfile, subprocess, tomllib, pathlib, shutil, signal
from time import sleep

# 1. program: pack index.js, configs and certificates into fine-program-{datetime}.tar.xz
def backup_program(log, time):
    result_filename = f'/result/fine-program-{time.strftime('%Y%m%d-%H%M%S')}.tar.xz'
    with tarfile.open(result_filename, 'w:xz') as f:
        # recursive by default,
        # no need to strip prefix in tarfile, they will mee same file structure when restore
        f.add('/data/main')
    print(f'backup.py: create {result_filename}')
    for filename in os.listdir('/result'):
        if filename.startswith('fine-program-') and filename != result_filename[8:]:
            log(f'remove previous file {filename}')
            os.remove(f'/result/{filename}')

# 2. database: pg_dump and pack into fine-database-{datetime}.tar.xz
def backup_database(log, time):
    pathlib.Path('/data/base').mkdir(parents=True, exist_ok=True)
    with open('/data/main/configs/backup.toml', 'rb') as config_file:
        config = tomllib.load(config_file)
        for item in config['databases']:
            username, databasename = item.split(':')
            log(f'pgdump user {username}, database {databasename}')
            result_filename = f'/data/base/{databasename}.sql'
            child = subprocess.run(['pg_dump', '--username', username, '-f', result_filename, databasename], capture_output=True)
            if child.stdout: log(f'pgdump {databasename} stdout: {child.stdout}')
            if child.stderr: log(f'pgdump {databasename} stderr: {child.stderr}')
            print(f'backup.py: pg_dump {databasename} return code {child.returncode}')
    result_filename = f'/result/fine-database-{time.strftime('%Y%m%d-%H%M%S')}.tar.xz'
    with tarfile.open(result_filename, 'w:xz') as f:
        f.add('/data/base')
    print(f'backup.py: create {result_filename}')
    for filename in os.listdir('/result'):
        if filename.startswith('fine-database-') and filename != result_filename[8:]:
            log(f'remove previous file {filename}')
            os.remove(f'/result/{filename}')

# 3. logs: pack certbot, database, core, backup logs into fine-logs.tar.xz
def backup_logs(log, time):
    # normalize certbot log file name
    certbot_log_dir = pathlib.Path('/data/logs/certbot')
    certbot_log_dir.mkdir(parents=True, exist_ok=True)
    certbot_staging_log_dir = pathlib.Path('/data/certbot-logs-staging')
    for filename in os.listdir(certbot_staging_log_dir):
        filepath = certbot_staging_log_dir / filename
        with open(filepath) as file:
            logtime = file.read(19)
        if len(logtime) != 19:
            continue # there is empty file? skip empty file
        logtime = datetime.datetime.strptime(logtime, '%Y-%m-%d %H:%M:%S')
        # / has higher priority than +, I guess
        expect_filename = 'letsencrypt-' + logtime.strftime('%Y%m%d-%H%M%S') + '.log'
        if filename == expect_filename:
            continue
        expect_filepath = certbot_log_dir / expect_filename
        if not expect_filepath.exists():
            filepath.copy(expect_filepath, preserve_metadata=True)
            log(f'certbot log: normalize {filename} to {expect_filename}')
    result_filename = f'/result/fine-logs.tar.xz'
    # w:xz overwrite existing file
    with tarfile.open(result_filename, 'w:xz') as f:
        f.add('/data/logs')
    print(f'backup.py: create {result_filename}')

# 4. additional: pack public into fine-public.tar.xz, node_modules into fine-node_modules.tar.xz
def backup_additional(log, time):
    result_filename = f'/result/fine-public.tar.xz'
    with tarfile.open(result_filename, 'w:xz') as f:
        f.add('/data/public')
    print(f'backup.py: create {result_filename}')
    result_filename = f'/result/fine-node_modules.tar.xz'
    with tarfile.open(result_filename, 'w:xz') as f:
        f.add('/data/node_modules')
    print(f'backup.py: create {result_filename}')

def backup_once(time):
    ok = False
    print(f'backup.py: start backup at {time.strftime('%Y-%m-%d %H:%M:%S')}')
    with open(f'/data/logs/backup/backup-{time.strftime('%Y%m%d-%H%M%S')}.log', 'a') as logfile:
        log = lambda content: logfile.write(f"{datetime.datetime.now(tz=datetime.UTC).strftime('%Y%m%dT%H%M%SZ')} {content}\n")
        try:
            backup_program(log, time)
            backup_database(log, time)
            backup_logs(log, time)
            backup_additional(log, time)
            # and finally rsync, use a dedicated sync command is how
            # you keep network operations parallel when they are contained inside a cli
            print(f'backup.py: rsync')
            child = subprocess.run([
                '/work/async',
                '-c', '/data/main/configs/backup.toml',
                'rsync',
                '--local', '/result',
                '--compare-hash',
            ], capture_output=True, env=dict(os.environ, RUST_LOG='r#async=trace'))
            if child.stdout: log(f'rsync stdout: {child.stdout}')
            if child.stderr: log(f'rsync stderr: {child.stderr}')
            ok = child.returncode == 0
            child_output = child.stdout.decode().strip()
            print('\n'.join([f'  rsync: {r}' for r in child_output.split('\n')]))
            print(f'backup.py: rsync return code {child.returncode}')
        except Exception as error:
            log(f'panic! {error}')
            print(f'backup.py: panic! {error}')
    print(f'backup.py: complete backup at {datetime.datetime.now(tz=datetime.UTC).strftime('%Y-%m-%d %H:%M:%S')}')
    return ok
# backup_once(datetime.datetime.now(tz=datetime.UTC))

def schedule():
    # this is different from certbot-renew-schedule,
    # that run randomly twice a day, regardless of command result,
    # this I expect always run successfully once a day, and don't need randomize
    # so the strategy is, always sleep to next minute = 0, check logs/last-ok, if today not done, run
    
    sleeping = False
    shutdown_requested = False
    def request_shutdown(s, f):
        if sleeping:
            print('backup.py: interrupting sleep...')
            raise SystemExit(0)
        else:
            print('backup.py: requesting shutdown...')
            shutdown_requested = True
    signal.signal(signal.SIGINT, request_shutdown)
    signal.signal(signal.SIGTERM, request_shutdown)

    startup_time = datetime.datetime.now(datetime.UTC)
    print(f'backup.py: start at {startup_time.strftime('%Y-%m-%d %H:%M:%S')}')

    while True:
        if shutdown_requested:
            print('backup.py: shutdown requested, exit')
            exit()
        now = datetime.datetime.now(datetime.UTC)
        # sleep to next time point with minute = 0
        try:
            sleeping = True
            sleep((60 - now.minute) * 60)
        except SystemExit:
            print('backup.py: shutdown requested in sleep, exit')
            exit(0)
        finally:
            sleeping = False
        # use hour >= 18 to effectively allows 6 times of retry if some error happens
        if now.hour < 18: continue
        # check last ok time
        last_ok_path = '/data/logs/backup/last-ok'
        try:
            with open(last_ok_path) as f:
                last_ok_time = datetime.datetime.strptime(f.read(), '%Y-%m-%d %H:%M:%S').replace(tzinfo=datetime.UTC)
        except Exception as error:
            print(f'backup.py: failed to load last ok time from last-ok file?', error)
        # today ok
        if now.date() == last_ok_time.date(): continue

        ok = backup_once(now) # <-- main action is here
        with open(last_ok_path, 'w') as f:
            f.write(now.strftime('%Y-%m-%d %H:%M:%S'))
        # a good complete log is written in backup once
schedule()
