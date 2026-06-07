# Containerization

beside common motivation and advantanges of containerization https://aws.amazon.com/what-is/containerization/,
it changes *how you think* about application's relationships with its environment in the process of migration,
in the steps of explicitly specify base image versions, explicitly declare apt/apk installed packages, manage
file structures for each service and seprate persistant data into volumes

by the way, it's even better for small websites that you can buy(薅) a cheap cloud server and easily start new

## Services

see setup/docker-compose.yml, for now this project is separated into these services

- an acme service that automatically renew certificates and reload web server, twice a day, at random time,
  but still need about 3 months to really renew some real certificates to test my setup is really working
- a database service, build and config see database.md
- the main web server, or the core module process, itself does not have container-specific topics,
  it even become more unspecific by removing systemd specific socket activation related operations,
  see socket activation issue in the archived native-service.md
- an akari service, this cannot exec into the main service because the volume mapping is different, main
  service map most volumes readonly, while akari need to support many deployment and hot reloading features
- a backup service, more on this later

to create the project from scratch (not tested)

- deploy images, for my network environment should build custom images on local
  and upload image like docker save fine/certbot | xz | ssh example.com 'docker load'
- sftp upload compose.yml, compose.sh, remote-akari.ts, akari.yml, package.json, package-lock.json
- npm i
- something like docker compose up --no-start to create the volumes
- docker run map fine-program and fine-configs,
  docker cp deploy remote-akari.ts, akari.yml, package.json, package-lock.json
- start remote akari, start local akari
- upload certbot.yml and domains.yml, create certificates by create.py, start acme service
- run database shell, run initdb.sh, start database service, insert initial data (users, etc.)
- build and deploy core module, build and upload user page
- upload home.html, 404.html, 418.html, config and upload content.yml, access.yml and dontry.yml
- start web server
- (optional) build and deploy short link service
- config and upload backup.yml, start backup service
- check everything works

to restore a full backup file from scratch

- run make-setup.py and upload fine-setup.tar.xz
- tar xJf fine-setup.tar.xz -C . && ./fine-setup.py and check output
- docker compose up database and check output
- docker compose up acme and check output
- docker compose up web and visit id.example.com, this nearly validates everything in core
- python3 backup.py run check manually trigger run once
- python3 dontry.py system check manually trigger
- systemctl enable fine-backup.timer && systemctl start fine-backup.timer
- systemctl enable fine-dontry.timer && systemctl start fine-dontry.timer

health check

- docker compose ps see all services are up
- docker compose logs should display placeholder message for core and database, and
  continuous plain message for acme twice a day, and backup success message once a day
- open id.example.com works ok, ip address display normally
- open public files like example.com/ef/checklist.txt ok
- open any application and the static files loads and access controlled api works

### Volumes

notable volumes

- acme service maps admin socket, to invoke reload certificate command in renew hooks
- database service maps logs directory with another volume, to allow for different lifetime control
  and backup strategies in future
- akari container maps all logs directory, to allow for temporary view and download of these files
- public content use its own volume, to exclude it from normal backup stategy,
  because this folder contains not important temporary files and may contain large files
- socket directory mapping can be readonly, if the service is not creating socket files
- node_modules can be readonly, no known issues for now

if an empty volume is mapped into a container with a location that is previously non empty in image,
these files are copied into the volume as initial data, then the volume become non empty and no more
automatic copies to disrupt, bind mount don't copy even it is initially empty, currently database
container is using this to populate initial config files and init script into main database volume

an unnamed volume is automatically created if it is declared in image but not mapped in docker run
command, or created by explicitly use -v without mapping source, is removed in normal docker command
like docker run -it --rm --name ... or docker compose run -it --rm --name ..., so you may worry
about volume lifetime in docker compose, but actually it's --rm's feature, the parameter not only
remove the container, but also removes unnamed volumes, the named volumes created by docker volume
create command or docker compose never removes without explicit docker volume rm command

bind mount support map single file, volume mount also support map single file with volume subpath,
also for docker compose service volume, so you can split config file into several config files for
different services to reduce secret exposure, e.g. certbot dns plugin need cloudflare secret, it is
stored in a dedicated certbot.yml file and mapped into acme service only, if web server is compromised?,
the cloudflare secret will not be affected

### Networks

network related functionalities are not used in the project,
database service use unix domain socket and most containers do not expose ports

but the source ip in tcp socket connection, also available in http request, is a fixed internal ip by default,
this is by design that external connections are proxied through docker engine for network functionalities like
communication between containers, which is not at all used by this project, and is a complete security hazard
that ip based validations and restrictions completely don't work

before the following sections check that your environment really provides real ip by running a simple http or
socket server on host (not in docker), e.g. nc -l -p 8001 -v, add -6 for ipv6

the correct answer for **rootless** docker is at
https://docs.docker.com/engine/security/rootless/troubleshoot/#docker-run--p-does-not-propagate-source-ip-addresses
add this

```ini
[Service]
Environment="DOCKERD_ROOTLESS_ROOTLESSKIT_NET=pasta"
Environment="DOCKERD_ROOTLESS_ROOTLESSKIT_PORT_DRIVER=implicit"
```

to `~/.config/systemd/user/docker.service.d/network.conf`, create `docker.service.d` if not exist, which by
default should not exist, other directories should exist, and `docker.service` file should exist, or else you
(or your environment) are configuring user level systemd services in other location, you may see the file name
is different from `override.conf` in the document, that's because you are free to name the file as long as the
name is reasonable and not conflict with other override config files

the pasta network driver is installed with apt install passt, if you find apt install pasta not work,
the pasta project is at https://passt.top/passt/about/, if you find the name is too general to search

without these settings the docker proxy will listen to ipv6 address if you simply specify -p 443:443, you can
check this by running `sudo netstat -tulpn`, that both 0.0.0.0:443 and :::443 is listened by rootlesskit, but
after this you need to explicitly add

```ini
Environment="DOCKERD_ROOTLESS_ROOTLESSKIT_FLAGS=--ipv6"
```

in the override config, this is not same as docker create network --ipv6 parameter and docker compose network
enable_ipv6 flag (you still need them to make concrete container and compose project work, don't forget), and
not at all mentioned in docker document https://docs.docker.com/engine/daemon/ipv6/

the command line arguments have basic help information at `rootlesskit --help` command, *not* available in
docker document https://docs.docker.com, the rootlesskit program source code is at
https://github.com/rootless-containers/rootlesskit,
not started with docker, no dedicated document site for rootlesskit, except a few markdown files in the repo,
the dockerd environment variables for rootlesskit is *not* available in docker document and rootless document,
I assume the most official document is at https://github.com/moby/moby/blob/master/contrib/dockerd-rootless.sh,
which is not started with docker, and states itself as separation of open source components from docker and
community contributions related with docker, the official site does not contain technical documents? the docs
folder in the repository does not contain technical documents for programs and tools in the repository? the
dockerd-rootless.sh script seems like entrypoint for rootlesskit program use in dockerd, it declares the env
vars _NET and _PORT_DRIVER, but not declare _FLAGS? but use _FLAGS in result rootlesskit command line, it also
contains a comprehensive comparison table between different network drivers and port drivers, which solves the
issue about source ip, but this useful table is *not* available in docker document

the rootlesskit contains a performance comparison between network drivers at
https://github.com/rootless-containers/rootlesskit/blob/master/docs/network.md,
which means docker rootless mode is completely not suitable for production level network heavy applications,
and completely not acceptable performance overhead for non production level projects that don't need container
communication etc. network features to trade for the non root security illusion

the common answer in ai and search result to setup a reverse proxy outside containers to set x-forwarded-for
etc. header, it is completely *incorrect*, it adds another performance overhead to parse http packet get socket
information and create http packet again to use in containered applications, on top of the existing performance
downgrade of default rootless network driver, and it is completely against the motivation for containerization
that important programs run outside of container

the common answer in ai and search result to disable userland-proxy is *incorrect*, it is completely not
related to docker rootless network features, by the way, if you are deceived to use this setting, you may find
error message: Error initializing network controller: error creating default "bridge" network: cannot restrict
inter-container communication or run without the userland proxy: stat /proc/sys/net/bridge/bridge-nf-call-
iptables: no such file or directory, you need run sudo modprobe br_netfilter for this issue, and check sudo
sysctl net.bridge.bridge-nf-call-iptables is 1, and add br_netfilter to /etc/modules-load.d/docker.conf for
long term change

the common answer in ai and search result to use --network host, is completely *incorrect* for rootless mode,
because rootless mode use kernel's user namespace feature, and the opened port is inside the user namespace,
not available outside, you can find this by difference in netstat inside container and outside the container,
and open another service to listen to same port outside container successfully runs

UPDATE: the common answer in ai and search result to add rules to DOCKER-USER chain is completely *incorrect*
for rootless mode, because iptables and nftables need very root permission to manipulate, and rootless mode does
not have the permission, so it will not use the chains and rules that look like will affect docker, the correct
answer here is adding rules directly at system level (add chain for type=filter hook=input), this is a *more*
complete security hazard than the previous no-source-ip issue because internal ips are obvious in logs and your
normal requests obviously quickly become blocked, but it looks completely fine in network filter info especially
without the counter flag, it even still looks kind of fine that these ips are good and don't send request after
they meet error or rejection in previous attempts when you see several 0s in the counters

by the way, these iptables rules are created by rootful docker when you install docker in normal way, and the
service is started once and the rules are created at that time. by the way, if you ask why these rules only work
for rootful docker but not for rootless docker, that's because rootful docker create a dummy network interface
and configure rules to forward traffic to the dummy device if some process in container need to listen to
something, rootless mode also don't have the permission to manipulate dummy network interfaces

by the way, windows + wsl + docker desktop also have strange network, and --network host also not works as
expected, this is even different from rootless docker's --network host behavior and mechanism, to make network
normal you should avoid docker desktop and use normal linux install approach instead

UPDATE no such issue in nonrootless mode

### Rootless Docker

there was a section that calmly talk about docker rootless mode, but after the investigation
of network issues in docker rootless mode, the answer is **DO NOT** use docker rootless mode

rootless mode is not docker default, and is very different from docker default and is very not well documented
in docker documents, it is even more not documented than the actually-is-plugin docker compose and docker build

rootless mode conform to linux default unpriviledged port setting, forbids your containerized application to
listen to low ports, forcing you to use any kind of proxy outside container include sudo socat run as a service,
sudo nginx run as a service, or systemd socket activation, adding performance and maintainance overhead, with the
threatening that change sysctl net.ipv4.ip_unprivileged_port_start is not secure

last year I'm deceived by the statement that root user is not secure and setup non root user and run my app to
use systemd socket activation with strange operation in source code, and making running the application without
systemd to diagnose issues very inconvenient, this year I'm deceived by the statement that rootless docker is
more secure and spend many time fighting against the docker proxy hiding source ip address issue, and I reallized
that, in a fully containerized environment

> compromise of active non-root user is complete compromise of all the meaningful resource on the machine

which is completely same as using root user, that even don't have so many special issues

after previous paragraphs, if you are still deceived by rootless mode, there are a few remaining small tips

- rootless config file is ~/.config/docker/daemon.json, replace common tutorial's /etc/docker/daemon.json
- rootless service is in systemctl --user status docker, add a --user compare to normal systemctl command
- ATTENTION don't install rootless docker after login as root and su normal user, because user level systemd
  is not correctly initialized in this case and rootless docker does not register itself as a systemd service
- also, sysctl net.ipv4.ip_unprivileged_port_start to avoid the port 80 problem
- rootless install script recommend adding DOCKER_HOST to environment variable, but use docker context is a
  more convenient and structured operation: docker context use rootless, and docker context create for other
  docker contexts, like over ssh

### Build Context

the cloud server currently (and in foreseeable future) cannot connect docker.io and ghcr.io, etc. normal image
hosting service, and the performance is too poor to run complex build process like build database from source,
so the images are uploaded to cloud server from dev machine, the upload command look like

docker save image:tag | xz | ssh server 'docker load'

and they are backed up with similar strategy and to same storage location so that restore process can download
them quickly and automatically, see setup/backup.py and setup/make-setup.py

### Additional Topics

- add profile to akari container so that it is not started or stopped with plain docker compose up command
- add version number to custom images, use the seems standard org.opencontainers.image.version label,
  it recommends semver in https://specs.opencontainers.org/image-spec/annotations/#pre-defined-annotation-keys,
  but not required, so I put a YYYYMMDD here, TODO really not use image tags?
- previously most files are in webroot and most of the place use relative path to find files and config files,
  now they separated into many locations to make the file structure more common and reasonable, to avoid write
  long absolute path to many places and easy to forget when change, several environment variables are added
  for these paths, all in compose.yml, making absolute path configuration more centralized

## Backup

as part of my motivation to containerization, to move around different cloud servers and cloud service providers
effeciently, also as part of the design objectives of file structure and volume structure in containers, also as
part of the cloud native transition to automate maintainance process, the backup and restore strategies are
different from traditional application deployments, if any

by the way, this application did not have any backup strategies before this transition, I even didn't backup any
physical files in the main working directory at that time, and was not familiar with the mysqldump command until
I manually collect data and files before first time moving to another cloud server, to make things more cool,
although I setup certificate automation process without correctly configure web server reload so that I had to
manually reload after I found the sites are not available on my local machine, before that, when the project
started at 2017, the acme protocol was even not yet a standard, which becomes rfc8555 in 2019, although eff and
certbot started research and development at about 2015, in the very early days, I manually acquire certificates
from my cloud server provider and manually install and update, which does not support SAN, or subject alternative
names, which authorize multiple domains or multiple subdomains in one certificate and not even mention wildcard
certificates which support any subdomains in one certificate

the major design objective of the backup strategy in this project is allowing restore in *one line command*,
which is a decompress command and running a script without parameter, to achieve this, you need to include

- database data
- program files, as program files is not published in a base image as they are kind of dynamic regarding the
  reverse proxy or api gateway nature of this project, this part also include config files and certificates,
  which also identifies itself as part of /etc hierachy
- container image files, as my network does not have access to docker hub and ghcr, etc., the container images
  are exported as tarballs and save to the same location as normal backup files when backup and downloaded same
  as normal backup files when restore

the save location is decided to be the object storage service provided by the same service provider, which is
especially good when transferring files between the cloud server and the storage service is internal network
and free of charge, which is bad when you think mount object storage into general computing service is a basic
functionality of a major cloud service provider, like https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-files-mounting.html,
but at aliyun it is too expensive comparing to the daily cost of a cheap cloud server and a basic storage
service, which is bad when the official tools are not commonly used and may be in danger of supply chain attacks
and the official sdks have very low download and reference statistics and are in extreme danger of supply chain
attacks and the official api use very bad authentication scheme and I have a complete section for this later

before you ask why there is a rust gear in the setup folder and why backup and restore script is written in
python while they are not restricted like certificate renew script, the original authentication implementation
was written in nodejs, although I tried to avoid 3rd party libraries at the beginning, it eventually depend on
a few 3rd party packages and need a node_modules to run, and to make things easier (it really looks easier when
the backup process is initially designed), it reuses the node_modules volume that I manually separated from the
main program volume assuming it will be large and does not need to be backed up and restored, and then the node
script with invocations of the pg_dump command and the tar command is formed and the backup service start to
run, and the local sync command works and the archive files automatically appears in local onedrive folder! now
you need to design the restore process, which was procrastinated but motivated by the rootless errors also
mentioned in this document, while there is definitely no nodejs runtime at host side, so you need to run the
download and restore process inside container, but you first need to deploy the compose file to create the data
volumes and define the services, and you need to install node_modules as they are excluded from the main backup
process, by the way don't forget to --omit=dev, with this mess you never figure out the dependency relationship
between these operations and how to organize the restore process into a one line command

one of the intermediate approach is wrapping the library into a command line tool and call the command across
container boundary (docker run -v... osstool:latest sync remote local), but this does not solve the node_modules
problem, take a full node_modules inside the image is not good, as it expands the attacking surface, maintain a
smaller nodejs project is not good, because I don't want to audit multiple projects against potention supply
chain attacks, and the final answer is *oxidize* (the unabbreviated term of riir is not used because it is kind
of horrific to appear in this near 10 year long nodejs project), which is even better when rustc default static
link all dependencies and you are free to run the command at local host and cloud server host side, the name of
the tool come from japanese, again, 同期, which means synchronization in data sync, file sync, etc.

with the free location of the sync tool now you can sort out which part to run inside container and which part
to run at host side, you cannot move everything outside the container because volumes are only available inside
container and its very not good to hack into docker internals and directly access from host fs, you cannot move
everything inside container because to backup the images you need to run docker cli commands and it's not very
good to install docker cli inside and map docker socket into container, so the result decision is only put the
collect part inside container which compress volume data into several archive files and save them into a folder
bind mount from host fs, and put invocation of the sync command and images backup and manage part out of
container, and in this case you can schedule the daily backup process as a systemd service, no need to setup
signal handling and sleep many hours in my code to run the actual backup code, this is not like certificate renew
service because that need randomization but systemd timer does not natively support, compare to the previously
single full backup file stored in oss root path, this time backup files and image files are separated and stored
in oss subpath to allow for efficient sync download command when restore

if you are very clever and find previously the nodejs script invoked pg_dump command and in history the backup
service base image was copying pg_dump and psql command from database build image, install their runtime
dependencies and map from database socket directory, and now the obvious pg_dump and psql command disappear from
backup.py, make-setup.py and setup.sh, that's because the backup script is now located in the database image and
database logical backup files are saved in a dedicated volume and mapped into backup service to effectively avoid
the database cli tools setup process in the backup image, and makes it a plain official python image, on the
restore part, one of the previous difficulties is that the backup sql file assume database to exist, and to check
database existance and confirm is empty you needs 2 very long psql command, this complexity become unncessary when
you realized restore process of database with logical backup files should be regarded database setup process with
seed data (initial data), and add a loop statement in database-setup.sh to run the sql files is enough and works
smoothly

the restore service is separated from backup service because that maps volumes readonly, and this does not need
logs volumes mapped, it is currently also a python base image although the restore script only runs bare commands
to extract files but not a dedicated python script, because the xz command is default not installed in an alpine
base image but the lzma library is default installed in a python base image, so you can see multiple python based
one line command in the restore script to extract the backup files, it may be more convenient the extraction part
need a dedicated python script in future

for reference, say host side working directory is /work,

- include compose.yml, backup.py, dontry.py, doki binary, doki.toml
- include normal backup files at /work/back, map to oss path /active
  - fine-database-{datetime}.tar.xz for the backup sql files,
    when new file arrive, old files at local are removed, at oss are moved to oss path /inactive,
  - fine-program-{datetime}.tar.xz for program files, config files and certificate files,
    when new file arrive, old files at local are removed, at oss are moved to oss path /inactive,
  - fine-public-{datetime}.tar.xz for public files, which may be large,
    when new file arrive, old files at local are removed, at oss are removed
  - fine-logs-{datetime}.tar.xz for all kind of logs, TODO this is relevant to log rotation strategy,
    when new file arrive, old files at local are removed, at oss are removed
- include images backup files at /work/images, map to oss path /images,
  naming convention image-{name}-{date}-{id}, id is short image id seen in docker images command

for reference, the main setup script, the setup.sh in setup.tar.xz

- download and deploy images
- download and extract normal backup files
- setup database with initial data
- setup host side services

for now, the backup files

- have one copy at host file system
- have one copy in object storage service
- have one copy on my local machine, by sync download command
- have one copy in my onedrive service,
  which effectively is a working mounting cloud storage service to local file system example

result in 4 copies of files in 2 different physical locations, which should be good

TODO the new storage structure does not work well with current sync download command,
result in duplicate file, redundent file and official node/python image redundent upload

### Logs

currently logs include

- certbot add log file for each certbot command, seems have log rotation
- database logs is created one per day, seems don't have log rotation
- web server logs is created one per day, have log rotation
  UPDATE other seems really don't have log rotation so this is turn off?

TODO design log rotation strategy

### Some SHI

aliyun oss have shit official sdk and shit signature mechanism in official http api, I have attacked that many times,
to make things worse, there are really many supply chain attacks in recent time, the poorly implemented sdk source code,
and nearly no one use them (less than 10k download per day), and rare update of the packages (all of the packages have
not updated for many months) make them extremely prone to supply chain attacks, I also have attacked this for some time

this time I successfully implement the signature mechanism in my code to access official http api, see setup/alioss.ts,
in case it is no longer needed and removed from this project, comparing to normal http api's insert the literal api key
in authorization header, the signature mechanism need

- set specific request headers,
  that not mentioned in api document and normal sdk document
- collect
  - http method
  - resource name (basically pathname),
  - query parameters but sorted?
  - headers selected and sorted,
  - additional headers but don't tell you how to choose them
  - and a constant literal field? looks like content hash,
    but not feasible for all requests all sizes of files, so I guess it is left for future dreams
- collect
  - a constant literal field, look like algorithm name
  - a datetime again? as it is already collected in required headers
  - a datetime again? as it is already collected in required headers and the previous line (you are not seeing a typo)
  - a service region again? as it is already inside the url to be accessed
  - a service name? as this mechanism is specifically designed for this service, other services have difference
  - a constant literal field, looks like algorithm version
  - hash previous section result
- hash
  - hash the time? as it is already collected in required headers and twice in previous section
    with the api key secret, after the confusion that api key is separated to key name and key secret
  - hash the service region again? as it is already the url and collected in previous section
    with previous hash result as key?
  - hash the service name? again? with previous hash result as key? again?
  - hash a constant literal value, looks like algorithm version, with previous hash result as key
  - hash the previous section result, with previous hash result as key
- plug the hash result into a special format authorization header, combined from
  - a constant literal field, looks like algorithm name
  - the access key name, after the confusion of separation of key name and key secret, again
  - time, again after 3?
  - region, again after 2?
  - service name, again after 2?
  - the additional headers list, the choice is not clear if you forget the problem
  - previous section hash result

and you finally received list objects result!
and you find it's returning xml object despite nowadays the fetch api even don't have a response.xml() function,
and you try to suggest accept: application/json in request header,
and everything explodes

### Backup Repository

some backup softwares and solutions have a concept of repository to store all related data for one backup project,
but here I mean, all my backup files are text, letsencrypt data files are text, my program files are text, config
files are text, database dump files are text *for now*, log files are text, so in theory I can

restore them into a git repository and use git to manage them?

and have other benefits like clearly see changes per day or cross several days overall the project, easy to rollback
(this part is same as full backup files), and easy to pick part of the files to restore? etc.

ai also suggests using git bundle instead of tar .git directory, I tried git bundle and compare with .git.tar.xz,
git bundle is a lot smaller, I guess git bundle only saves data files not saves git's similar concept of wal/redo logs?

for now, I tried the approach once, but certbot's log rotation mechanism is confusing, investigate this more

UPDATE: rename letsencrypt logs to time available at leading 19 bytes of the file fix the issue
for now, when you try to invoke git in container, you need install and configure git in the python container,
and search for git library in python leads you to https://github.com/gitpython-developers/gitpython,
and the repository readme leads you to https://github.com/GitoxideLabs/gitoxide, so I'd like to try to follow the lead
and maintain the backup repository in rust?
