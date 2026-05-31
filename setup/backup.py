import sys, subprocess, json, datetime, pathlib, tarfile

# run subprocess, collect output to display, return stdout, abort on error
def run_subprocess(command_name, command: list[str]):
    print(f'backup.py: run {' '.join(command)}')
    child = subprocess.run(command, capture_output=True)
    stdout = ''
    if child.stdout:
        stdout = child.stdout.decode().strip()
        print('\n'.join([f'  {command_name}: {r.strip()}' for r in stdout.splitlines()]))
    if child.stderr:
        stderr = child.stderr.decode().strip()
        print('\n'.join([f'  {command_name}: {r.strip()}' for r in stderr.splitlines()]))
    if child.returncode:
        print(f'backup.py: {command_name} return code {child.returncode}, abort')
        exit(1)
    print(f'backup.py: {command_name} return code 0')
    return stdout

# save newest version of images, remove not newest version from local and oss
def backup_images():
    images_dir = pathlib.Path('~/images').expanduser()
    existing_paths = [p for p in images_dir.iterdir()]
    # alpine is not referenced in compose.yml but useful base image for generic purpose shell
    for image_name in ('alpine', 'node', 'python', 'database', 'certbot'):
        # get image id
        print(f'backup.py: {image_name}: run docker inspect fine/{image_name}:latest')
        child = subprocess.run(['docker', 'inspect', '--format', 'json', f'fine/{image_name}:latest'], capture_output=True)
        child_output = child.stdout.decode().strip()
        if child.stdout:
            pass # this is long
            # print('\n'.join([f'  inspect: {r}' for r in child_output.split('\n')]))
        if child.stderr:
            print('\n'.join([f'  inspect: {r}' for r in child.stderr.decode().strip().split('\n')]))
        if child.returncode:
            print(f'backup.py: {image_name}: docker inspect return code {child.returncode}, skip')
            continue
        try:
            image_info = json.loads(child_output)
        except Exception as error:
            print(f'backup.py: {image_name}: inspect result failed to parse json? raw:\n{child_output}\nerror:\n', error)
            continue
        if not isinstance(image_info, list):
            print(f'backup.py: {image_name}: inspect result unexpected structure?(1) raw:\n{child_output}')
            continue
        if 'Id' not in image_info[0]:
            print(f'backup.py: {image_name}: inspect result unexpected structure?(2) raw:\n{child_output}')
            continue
        image_id = image_info[0]['Id']
        if not image_id.startswith('sha256:'):
            print(f'backup.py: {image_name}: id not start with sha256:? how? raw:\n{child_output}')
        image_short_id = image_id[7:19]
        # do not create new file if image id already exist
        # although short id, I assume short id will not conflict in this situation
        if any(image_short_id in p.name for p in existing_paths):
            print(f'backup.py: {image_name}: id {image_short_id} exist in previous backup, skip')
            continue
        # create archive file
        date = datetime.datetime.now(datetime.UTC).strftime('%Y%m%d')
        archive_filename = f'image-{image_name}-{date}-{image_short_id}.tar.xz'
        print(f'backup.py: {image_name}: run docker save')
        child = subprocess.run(f'docker image save fine/{image_name}:latest | xz > {images_dir / archive_filename}', shell=True, capture_output=True, text=True)
        if child.stdout:
            print('\n'.join([f'  inspect: {r}' for r in child_output.split('\n')]))
        if child.stderr:
            print('\n'.join([f'  inspect: {r}' for r in child.stderr.decode().strip().split('\n')]))
        if child.returncode:
            print(f'backup.py: {image_name}: docker save return code {child.returncode}, what happened?')
            continue
        print(f'backup.py: {image_name}: create {archive_filename}')
        # clear previous versions of this image
        for filepath in existing_paths:
            filename = filepath.name
            if filename != archive_filename and filename.startswith(f'image-{image_name}-') and filename.endswith('.tar.xz'):
                print(f'backup.py: {image_name}: remove previous file {filepath}')
                filepath.unlink()
    # sync
    run_subprocess('doki', ['./doki',
        '-c', 'doki.toml', '--no-implicit-config-hint', 'sync', '-a', str(images_dir), 'oss:images'])

# collect volume data from mapped /data to mapped /work/backup
def collect_volume_data():
    if not pathlib.Path('/.dockerenv').exists():
        print('backup.py: collect function is expected to run in container')
        exit(1)

    now = datetime.datetime.now(datetime.UTC)
    backup_dir = pathlib.Path('/work/backup')
    backup_dir.mkdir(exist_ok=True)
    # 1. fine-program-{datetime}.tar.xz from /data/main
    program_archive_path = backup_dir / f'fine-program-{now.strftime('%Y%m%d-%H%M%S')}.tar.xz'
    with tarfile.open(program_archive_path, 'w:xz') as f:
        # recursive by default,
        # no need to strip prefix in tarfile, they will mee same file structure when restore
        f.add('/data/main')
    print(f'backup.py: create {program_archive_path}')
    for old_archive_path in backup_dir.glob('fine-program-*.tar.xz'):
        if old_archive_path != program_archive_path:
            print(f'backup.py: remove {old_archive_path}')
            old_archive_path.unlink()

    # 2. fine-database-{datetime}.tar.xz from /data/base
    database_archive_path = backup_dir / f'fine-database-{now.strftime('%Y%m%d-%H%M%S')}.tar.xz'
    with tarfile.open(database_archive_path, 'w:xz') as f:
        f.add('/data/base')
    print(f'backup.py: create {database_archive_path}')
    for old_archive_path in backup_dir.glob('fine-database-*.tar.xz'):
        if old_archive_path != database_archive_path:
            print(f'backup.py: remove {old_archive_path}')
            old_archive_path.unlink()

    # 3. fine-logs-{datetime}.tar.xz from /data/logs
    # with normalize cerbot logs
    certbot_logs_dir = pathlib.Path('/data/logs/certbot')
    certbot_logs_dir.mkdir(parents=True, exist_ok=True)
    for filepath in pathlib.Path('/data/certbot-logs-staging').iterdir():
        with open(filepath) as file:
            logtime = file.read(19)
        if len(logtime) != 19:
            continue # there is empty file? skip empty file
        logtime = datetime.datetime.strptime(logtime, '%Y-%m-%d %H:%M:%S')
        # / has higher priority than +, I guess
        normalize_filepath = certbot_logs_dir / f'letsencrypt-{logtime.strftime('%Y%m%d-%H%M%S')}.log'
        if not normalize_filepath.exists():
            filepath.copy(normalize_filepath, preserve_metadata=True)
            # print(f'backup.py: normalize {filepath} to {normalize_filepath}')
    logs_archive_path = backup_dir / f'fine-logs-{now.strftime('%Y%m%d-%H%M%S')}.tar.xz'
    with tarfile.open(logs_archive_path, 'w:xz') as f:
        f.add('/data/logs')
    print(f'backup.py: create {logs_archive_path}')
    for old_archive_path in backup_dir.glob('fine-logs-*.tar.xz'):
        if old_archive_path != logs_archive_path:
            print(f'backup.py: remove {old_archive_path}')
            old_archive_path.unlink()

    # 4. fine-public-{datetime}.tar.xz from /data/public
    public_archive_path = backup_dir / f'fine-public-{now.strftime('%Y%m%d-%H%M%S')}.tar.xz'
    with tarfile.open(public_archive_path, 'w:xz') as f:
        f.add('/data/public')
    print(f'backup.py: create {public_archive_path}')
    for old_archive_path in backup_dir.glob('fine-public-*.tar.xz'):
        if old_archive_path != public_archive_path:
            print(f'backup.py: remove {old_archive_path}')
            old_archive_path.unlink()

def run():
    print(f'backup.py: backup at {datetime.datetime.now(datetime.UTC).strftime('%Y%m%d %H%M%S')}')

    # 1. backup database
    # this overwrite result sql files, can rerun freely even when error happens in following steps
    run_subprocess('backup-database.sh', ['docker', 'compose', 'run',
        '--rm', '--name', 'db-backup1', '--entrypoint', 'sh /var/lib/pgsql/backup.sh', 'database'])
    # 2. collect volume data
    # this remove previous files, can rerun freely even when error happens in following steps
    workdir = pathlib.Path().absolute()
    # for now you cannot see realtime output because they are collected after whole process complete
    run_subprocess('backup-collect.py', ['docker', 'compose', 'run', '--rm', '--name', 'backup1',
        '-v', f'{workdir}:/work', '--entrypoint', 'python /work/backup.py collect', 'backup'])

    # 3. upload files
    list_output = run_subprocess('doki', [str(workdir / 'doki'),
        '-c', 'doki.toml', '--no-implicit-config-hint', 'list', '--prefix', 'active', '--format', 'csv'])
    existing_objects = [','.join(record.split(',')[:-2]) for record in list_output.splitlines()]
    # first upload
    backup_dir = workdir / 'backup'
    run_subprocess('doki', [str(workdir / 'doki'),
        '-c', 'doki.toml', '--no-implicit-config-hint', 'sync', '-a', str(backup_dir), 'oss:active'])
    # then remove not used files
    local_filepaths = [p for p in backup_dir.iterdir()]
    for existing_object_path in existing_objects:
        # *.parts[1:] means pop front
        expect_localpath = backup_dir / pathlib.Path(*pathlib.Path(existing_object_path).parts[1:])
        if expect_localpath not in local_filepaths:
            if expect_localpath.name.startswith('fine-program') or expect_localpath.name.startswith('fine-database'):
                inactive_path = pathlib.Path('/inactive') / expect_localpath.name
                run_subprocess('doki', [str(workdir / 'doki'),
                    '-c', 'doki.toml', '--no-implicit-config-hint', 'copy', f'oss:{existing_object_path}', f'oss:{inactive_path}'])
                run_subprocess('doki', [str(workdir / 'doki'),
                    '-c', 'doki.toml', '--no-implicit-config-hint', 'drop', f'oss:{existing_object_path}'])
            elif expect_localpath.name.startswith('fine-logs') or expect_localpath.name.startswith('fine-public'):
                run_subprocess('doki', [str(workdir / 'doki'),
                    '-c', 'doki.toml', '--no-implicit-config-hint', 'drop', f'oss:{existing_object_path}'])
    print(f'backup.py: backup complete at {datetime.datetime.now(datetime.UTC).strftime('%Y%m%d %H%M%S')}')

if len(sys.argv) == 2 and sys.argv[1] == 'run':
    run()
elif len(sys.argv) == 2 and sys.argv[1] == 'collect':
    collect_volume_data()
elif len(sys.argv) == 2 and sys.argv[1] == 'images':
    backup_images()
else:
    print('backup.py run | images')
    exit(1)
