import os, datetime, subprocess, pathlib, tarfile, tomllib

def restore_program(filenames):
    max_filename = None
    for filename in filenames:
        if filename.startswith('fine-program-') and filename.endswith('.tar.xz'):
            # actually you don't need to parse datetime to find max
            # actually after validating begin and end you can directly compare whole string
            if max_filename is None or filename > max_filename:
                max_filename = filename
    if max_filename is None:
        print('restore.py: not found any fine-program- file?, abort')
        exit(1)
    print(f'restore.py: doki download {max_filename}')
    child = subprocess.run([
        '/work/doki',
        '-c', '/setup/backup.toml',
        'download'
        f'/stage/{max_filename}',
        '--object-name', max_filename,
    ], capture_output=True)
    if child.stdout: print(f'doki stdout: {child.stdout}')
    if child.stderr: print(f'doki stderr: {child.stderr}')
    if child.returncode != 0:
        print(f'restore.py: doki download return code {child.returncode}, abort')
        exit(1)
    with tarfile.open(f'/stage/{max_filename}', 'r:xz') as f:
        f.extractall()
    print(f'restore.py: extract {max_filename} complete')

def restore_database(filenames):
    max_filename = None
    for filename in filenames:
        if filename.startswith('fine-database-') and filename.endswith('.tar.xz'):
            # actually you don't need to parse datetime to find max
            # actually after validating begin and end you can directly compare whole string
            if max_filename is None or filename > max_filename:
                max_filename = filename
    if max_filename is None:
        print('restore.py: not found any fine-database- file?, abort')
        exit(1)
    print(f'restore.py: doki download {max_filename}')
    child = subprocess.run([
        '/work/doki',
        '-c', '/setup/backup.toml',
        'download'
        f'/stage/{max_filename}',
        '--object-name', max_filename,
    ], capture_output=True)
    if child.stdout: print(f'doki stdout: {child.stdout}')
    if child.stderr: print(f'doki stderr: {child.stderr}')
    if child.returncode != 0:
        print(f'restore.py: doki download return code {child.returncode}, abort')
        exit(1)
    with tarfile.open(f'/stage/{max_filename}', 'r:xz') as f:
        f.extractall()
    print(f'restore.py: extract {filename} complete')

    # TODO psql --username username -Atc "SELECT 1 FROM pg_database WHERE datname='fine'" expect stdout == '1'
    # TODO psql --username username --dbname fine -Atc "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'" expect no stdout
    # TODO psal --username username --dbname fine -f /data/base/fine.sql

    with open('/setup/backup.toml', 'rb') as config_file:
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

def restore_additional(filenames):
    for filename in ['fine-public.tar.xz', 'fine-node_modules.tar.xz']:
        if filename not in filenames:
            print(f'restore.py: not found {filename}?, skip')
            continue
        print(f'restore.py: doki download {filename}')
        child = subprocess.run([
            '/work/doki',
            '-c', '/data/main/configs/backup.toml',
            'download'
            f'/stage/{filename}',
            '--object-name', filename,
        ], capture_output=True)
        if child.stdout: print(f'doki stdout: {child.stdout}')
        if child.stderr: print(f'doki stderr: {child.stderr}')
        if child.returncode != 0:
            print(f'restore.py: doki download return code {child.returncode}, skip')
            continue
        with tarfile.open(f'/stage/{filename}', 'r:xz') as f:
            f.extractall()
        print(f'restore.py: extract {filename} complete')

def restore_images():
    for image_name in ['certbot', 'database', 'node']:
        pass

def restore():
    try:
        print(f'restore.py: doki list')
        child = subprocess.run([
            '/work/doki',
            # ATTENTION backup.py is using /data/main/configs by the way,
            # this is not true for restore.py, restore.py need map setup folder into /setup
            '-c', '/setup/backup.toml',
            'list'
            '--noninteractive',
        ], capture_output=True)
        if child.stdout: print(f'doki stdout: {child.stdout}')
        if child.stderr: print(f'doki stderr: {child.stderr}')
        if child.returncode != 0:
            print(f'restore.py: doki list return code {child.returncode}, abort')
            exit(1)
        child_output = child.stdout.decode().strip()
        filenames = [' '.join(record.split(' ')[:-2]) for record in child_output.splitlines()]
        if 'RUST_LOG' in os.environ:
            print('all files:')
            for filename in filenames:
                print(filename)
        pathlib.Path('/stage').mkdir(parents=True, exist_ok=True)

        restore_program(filenames)
        restore_database(filenames)
        restore_additional(filenames)
        restore_images(filenames)

    except Exception as error:
        print(f'restore.py: panic! {error}')

restore()
# related file structure:
# - /work: doki, backup.py, restore.py (this program)
# - /data: volume data
#   - /data/base: database dump file staging directory
#   - (this program do not use log file and do not schedule tasks)
# - /setup: setup script working directory
#   - /setup/backup.toml: config for this program (this is different from backup.py)
# - /result: result archive files mapped from host fs, put downloaded
#            archive files which effectively work as latest backup files for backup.py
