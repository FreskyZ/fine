#!/usr/local/bin/python
import os, pathlib, socket

# certbot renew deploy hook which calls reload-certificate admin interface function

# certbot document says deploy hook is only invoked when any certificate is renewed
# so this script always call the rpc function regardless of the parameter,
# because that side (src/core/index.ts) always check all the certificates to update

if 'FINE_SOCKET_DIR' not in os.environ:
    print('deploy.py: missing FINE_SOCKET_DIR, don\'t forget to set var if you are manual testing')
    exit(1)
socket_dir = pathlib.Path(os.environ['FINE_SOCKET_DIR'])
socket_path = socket_dir / 'fine.socket'
if not socket_path.exists():
    print('deploy.py: socket file not found, skip')
    exit()

connection = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
try:
    connection.connect(str(socket_path))
except Exception as ex:
    print('deploy.py: failed to connect', ex)
    exit(1)

message = '{"kind":"reload-certificate"}'
print(f'deploy.py: sending {message}')
connection.sendall(message.encode('utf-8'))

# receive response until idle
connection.settimeout(5)
received_data = []
while True:
    try:
        data = connection.recv(8192)
        if not data:
            break # received eof
        received_data.append(data)
    except socket.timeout:
        print('deploy.py: recv timeout, regard as complete')
        break
    except Exception as e:
        print('deploy.py: recv unexpected error', e)
        exit(1)

print('deploy.py: received', b''.join(received_data))
connection.close()
