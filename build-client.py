#!python3
'''
./build-client.py acct dev => 
HOME_FRESKY_PROJECT_NAME=acct webpack --mode development
'''

import sys
import subprocess

if len(sys.argv) != 3:
    print('invalid argument count, expect ./build-client.py <project_name> <mode>')
    exit()

project_name = sys.argv[1];
webpack_mode = sys.argv[2];

exit(subprocess.Popen(\
    '$(which webpack) --mode ' + webpack_mode, shell=True, env={ 'HOME_FRESKY_PROJECT_NAME': project_name }).wait())

