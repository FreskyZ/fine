import os, datetime, pathlib

# not sure what to put in this script

# tar xJf fine-backup-20260418-131554.tar.xz -C ~/fine-backup
# git init
# python backup-data.py
# git commit -m"initial commit"
# loop:
#   tar xJf a new file
#   python backup-data.py
#   git commit -m"data 20260419"

# 1. change letsencrypt log file name to command execution time
# if new file name exist, remove this file
# certbot rotate log files in a confusing way,
# change file name to its leading characters which represent a time

has_operation = False
certbot_log_dir = pathlib.Path('/data/certbot-logs')
for filename in os.listdir(certbot_log_dir):
    filename = certbot_log_dir / filename
    with open(filename) as file:
        time = file.read(19)
    if len(time) != 19:
        # there is empty file? remove empty file
        print(f'remove likely empty file {filename}? content: {time}')
        os.remove(filename)
        continue
    time = datetime.datetime.strptime(time, '%Y-%m-%d %H:%M:%S')
    # / has higher priority than +, I guess
    expect_filename = certbot_log_dir / ('letsencrypt-' + time.strftime('%Y%m%d-%H%M%S') + '.log')
    if filename != expect_filename:
        has_operation = True
        # os.rename silently overwrites on linux, although this script will never
        # run on windows, and same expect_filename should means same content, I still
        # think silently overwrite is not good, so check in advance
        if expect_filename.exists():
            print(f'remove {filename} because {expect_filename} exists')
            os.remove(filename)
        else:
            print(f'rename {filename} to {expect_filename}')
            os.rename(filename, expect_filename)
if not has_operation:
    print('up to date')

# TODO to automate the process need install and setup git in container,
# git report something like fatal: detected dubious ownership in repository at '/data' in container,
# try oxidize this in future?

