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

- build custom images on local
  upload image, e.g. docker save my/certbot:1 | xz | ssh example.com 'docker load'
- sftp upload compose.yml, remote-akari.ts, akari.yml, package.json, package-lock.json
- npm i
- something like docker compose up akari --no-start to create the volumes
  docker run map the created volumes, docker cp these files into position
- start remote akari container, start local akari
- upload certbot.yml and domains.yml, create certificates by create.py, start acme service
- run database shell, run initdb.sh, start database service, insert initial data (users, etc.)
- build and deploy core module, build and upload user page
- upload home.html, 404.html, 418.html, config and upload content.yml and access.yml
- start web server
- (optional) build and deploy short link service
- config and upload backup.yml, start backup service
- check everything works

to restore a full backup file from scratch, currently, TODO test run

- build custom images on local, upload images
- sftp upload compose.yml, backup.yml, package.json, package-lock.json
- run database shell, run initdb.sh, start database service
- start backup shell, npm i, download backup file, restore data, restore databases
- start acme service, start web server, start backup service, start remote akari
- check everything works

health check

- docker compose ps see all services are up
- docker compose logs should display placeholder message for core and database, and
  continuous plain message for acme twice a day, and backup success message once a day
- open id.example.com works ok, ip address display normally
- open public files like example.com/endfield-checklist.txt ok
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

network related functionality is not used in the project,
database service use domain socket and containers other than main web server do not expose ports

ATTENTION TODO ip is internal for default network setting,
see real ip by running nc -l -p 8001 -v on host (not in docker),
also check this issue when using ipv6,
also see https://deavid.wordpress.com/2019/06/15/how-to-allow-docker-containers-to-see-the-source-ip-address/

### Build Context

comparing to send related files (in setup directory) to remote and download base images
with the fragile network of cloud servers inside this region and build with the poor specs
of cheap cloud server, build at local side and upload thme is easier, you can easily upload
image with one line shell command docker save image:tag | ssh server 'docker load', also
support add an intermediate compression to reduce network usage: docker | xz | ssh docker

### Rootless Docker

see https://docs.docker.com/engine/security/rootless/

- rootless config file is ~/.config/docker/daemon.json, replace common tutorial's /etc/docker/daemon.json
- but you still can run a container with bind mount and run root commands with a root user?
- TODO is podman's security by default advertisement really fit me and this project?
- ATTENTION don't install rootless docker after login as root and su normal user, because user level systemd
  is not correctly initialized in this case and rootless docker does not register itself as a systemd service
- also, sysctl net.ipv4.ip_unprivileged_port_start to avoid the port 80 problem,
  it is meaningless to disallow non root applications to open low ports to guard from the non existence
  "other human users" on the same machine

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

for now, these items are backed up:

- certificates, the traditional /etc/letsencrypt folder
- database data, see database.md
- the main program, include index.js, static files and server files
- certbot logs, database logs, web server logs and backup logs itself?

for now, the backup service create a full backup file per day

- save one copy to the same cloud service provider's object storage service
- local sync script is run manually and occassionally to store one copy on my local machine
- and the local location is mapped to onedrive to form another copy

result in 3 copies of files in 3 different physical locations, which should be good

by the way, you may think mount object storage into general computing service is a basic
functionality, like https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-files-mounting.html,
but for aliyun it is too expensive for me, I have to access its api to upload and manage files

### Logs

for now these logs are simply packed together to form a full backup file

- certbot add log file for each certbot command, seems have log rotation
- database logs is created one per day, seems don't have log rotation
- web server logs is created one per day, have log rotation
- backup logs is created for each backup operation, normally one per day, don't have log rotation

TODO you seems need to handle log rotation for these files, remove very old entries and keep relative new entries

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
and you try to suggest accept: application/xml in request header,
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

for now, I tried the approach once, but certbot's log rotation mechanism is confusing, TODO investigate this more
