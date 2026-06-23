import sys, subprocess, json, datetime, pathlib, tarfile, ipaddress

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
    images_dir = pathlib.Path('./images').absolute()
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
        # TODO unexpected duplicate file in remote directory?
    # sync
    run_subprocess('doki', ['./doki',
        '-c', 'doki.toml', '--no-implicit-config-hint', 'sync', '-a', str(images_dir), 'oss:images'])
    print(f'backup.py: backup images complete')

# this is not like backup, but kind of like renaming letsencrypt logs that transform dontry.log to dontry.conf
# so put it here for now, also for now collect these operations in same script can make file structure simpler
def collect_network_filters():
    # convert dontry.log to nftables format dontry.conf, see also src/core/dontry.ts,
    # works for naive service setup that blocks access to all services on the host *except* in
    # docker bridge networks, works for services in docker bridge networks with --forward, works
    # for services in docker bridge networks without br_netfilter(?) with --bridge --forward params

    # nftables: https://netfilter.org/projects/nftables/index.html
    #      man: https://netfilter.org/projects/nftables/manpage.html
    # related commands for test or debug:
    # - list rules: sudo nft list chain ip filter DOCKER-USER
    # - create set: sudo nft add set ip filter blocked_ips \{ type ipv4_addr\; flags interval\; \}
    #   can have same name in different family: sudo nft add set ip6 filter blocked_ips \{ type ipv6_addr\; flags interval\; \}
    # - display set: sudo nft list set ip filter blocked_ips
    #   json output: sudo nft --json list set ip filter blocked_ips
    # - add elements: sudo nft add element ip filter blocked_ips \{ 195.179.11.0/24, 45.148.10.0/24 \}
    #   delete elements: sudo nft delete element ip filter blocked_ips \{ 195.179.11.0/24, 45.148.10.0/24 \}
    # - use set: sudo nft add rule ip filter DOCKER-USER ip saddr @blocked_ips tcp dport \{ 80, 443 \} counter drop
    #   this will display a source address 0.0.0.0 in iptables-nft output, but ok in nft
    # - delete set: sudo nft delete set ip filter blocked_ips, cannot delete when used in rule

    if not pathlib.Path('/.dockerenv').exists():
        print('backup.py: collect function is expected to run in container')
        exit(1)
    if not pathlib.Path('/data/logs/fine/dontry.log').exists():
        print('not found dontry.log, skip')
        exit(0)
    with open('/data/logs/fine/dontry.log') as f:
        rawlog = f.read()
    logrecords = [] # (address, network, time)
    for row in rawlog.splitlines():
        splitted = row.split(' ')
        if len(splitted) <= 1:
            print(f'dontry.py: log record {row} unexpected format?')
            continue
        # the z part is literal when write into log, but you can parse it as timezone
        time = datetime.datetime.strptime(splitted[0], '%Y%m%dT%H%M%S%z')
        try:
            address = ipaddress.ip_address(splitted[1])
        except ValueError as ex:
            print(f'dontry.py: log record {row} parse ip address fail?', ex)
            continue
        network = ipaddress.ip_network(int(address))
        if isinstance(address, ipaddress.IPv4Address):
            network = network.supernet(prefixlen_diff=8)
        elif address.ipv4_mapped is None:
            network = network.supernet(new_prefix=64)
        else:
            # add both records for ipv4 mapped ipv6 records
            mapped_address = address.ipv4_mapped
            mapped_network = ipaddress.ip_network(int(mapped_address))
            mapped_network = mapped_network.supernet(prefixlen_diff=8)
            logrecords.append((mapped_address, mapped_network, time))
            # print(f'log {time} {mapped_address} ({mapped_network})')
            network = network.supernet(prefixlen_diff=8)
        logrecords.append((address, network, time))
    # print('\n'.join([str(r) for r in logrecords]))

    elements = []
    # multiple occurance of ip from same subnet regardless of any time, ban subnet permanently
    all_networks = set()
    for address, network, time in logrecords:
        if network in all_networks:
            elements.append(network)
        all_networks.add(network)
    # single occurance of ip, ban this day
    now = datetime.datetime.now(tz=datetime.UTC)
    for address, network, time in logrecords:
        if network not in elements and (now - time).total_seconds() < 86400:
            elements.append(address)
    # TODO need to clear outdated entries?
    # print('\n'.join([str(r) for r in elements]))

    family = 'bridge' if '--bridge' in sys.argv else 'inet'
    table = 'dontry'
    hook = 'forward' if '--forward' in sys.argv else 'input'
    setname = 'aset'

    b = '\n'
    b += f'table {family} {table}\n'
    b += f'flush table {family} {table}\n'
    b += f'table {family} {table} {{\n'
    b += f'    set {setname}4 {{\n'
    b += f'        type ipv4_addr; flags interval;\n'
    b += f'        elements = {{\n'
    for element in elements:
        if isinstance(element, (ipaddress.IPv4Address, ipaddress.IPv4Network)):
            b += f'            {element},\n' # this even support trailing comma!
    b += '        }\n'
    b += '    }\n'
    b += f'    set {setname}6 {{\n'
    b += f'        type ipv6_addr; flags interval;\n'
    b += f'        elements = {{\n'
    for element in elements:
        if isinstance(element, (ipaddress.IPv6Address, ipaddress.IPv6Network)):
            b += f'            {element},\n'
    b += '        }\n'
    b += '    }\n'
    b += f'    chain filter-{hook} {{\n'
    b += f'        type filter hook {hook} priority filter; policy accept;\n'
    b += f'        ip saddr @{setname}4 tcp dport 443 counter drop\n'
    b += f'        ip6 saddr @{setname}6 tcp dport 443 counter drop\n'
    b += '    }\n'
    b += '}\n'

    with open('/work/dontry.conf', 'w') as f:
        f.write(b)

def apply_network_filters():
    print(f'filter.py: setup nft at {datetime.datetime.now(datetime.UTC).strftime('%Y-%m-%d %H:%M:%S')}')
    # 1. transform log format into config format
    workdir = pathlib.Path().absolute()
    run_subprocess('collect-nft.py', ['docker', 'compose', 'run', '--rm', '--name', 'nft-collect1',
        '-v', f'{workdir}:/work', '--entrypoint', 'python /work/backup.py collect-nft', 'backup'])
    # 2. apply
    run_subprocess('nft', ['nft', '-f', str(workdir / 'dontry.conf')])
    print(f'filter.py: setup nft complete at {datetime.datetime.now(datetime.UTC).strftime('%Y-%m-%d %H:%M:%S')}')

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
    print(f'backup.py: backup at {datetime.datetime.now(datetime.UTC).strftime('%Y-%m-%d %H:%M:%S')}')

    # 1. backup database
    # this overwrite result sql files, can rerun freely even when error happens in following steps
    run_subprocess('backup-database.sh', ['docker', 'compose', 'run',
        '--rm', '--name', 'db-backup1', '--entrypoint', 'sh /var/lib/pgsql/backup.sh', 'database'])
    # 2. collect volume data
    # this remove previous files, can rerun freely even when error happens in following steps
    workdir = pathlib.Path().absolute()
    # for now you cannot see realtime output because they are collected after whole process complete
    run_subprocess('backup-collect.py', ['docker', 'compose', 'run', '--rm', '--name', 'backup-collect1',
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
    print(f'backup.py: backup complete at {datetime.datetime.now(datetime.UTC).strftime('%Y-%m-%d %H:%M:%S')}')

if len(sys.argv) == 2 and sys.argv[1] == 'run':
    run()
elif len(sys.argv) == 2 and sys.argv[1] == 'collect':
    collect_volume_data()
elif len(sys.argv) == 2 and sys.argv[1] == 'nft':
    apply_network_filters()
elif len(sys.argv) == 2 and sys.argv[1] == 'collect-nft':
    collect_network_filters()
elif len(sys.argv) == 2 and sys.argv[1] == 'images':
    backup_images()
else:
    print('USAGE: backup.py run | nft | images')
    exit(1)
