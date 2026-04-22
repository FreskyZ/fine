
# docker build --target certbot --tag my/certbot:1 .
FROM certbot/certbot:v5.4.0 AS certbot

LABEL org.opencontainers.image.version=20260414

# the evil pip install to global by default, which is convenient for this case
RUN pip install --root-user-action=ignore dnspython pyyaml

WORKDIR /
# no need to put auth hook in /etc/letsencrypt, it is now tracked in git
COPY --chmod=700 certbot-auth-hook.py certbot-create-cert.py certbot-deploy-hook.py certbot-renew-schedule.py /
# cannot move deploy hook into /etc/letsencrypt here, or else it is masked by volume mounting
RUN mv certbot-auth-hook.py auth.py && mv certbot-create-cert.py create.py && mv certbot-deploy-hook.py deploy.py && mv certbot-renew-schedule.py schedule.py

# setup dev env: docker volume create certificates && docker volume create certbot-libs && docker volume create certbot-logs && docker volume create fine-configs
# move certbot.yml and domains.yml into fine-configs
# shell: docker run -it --rm --name acme1 -v certificates:/etc/letsencrypt -v certbot-libs:/var/lib/letsencrypt -v certbot-logs:/var/log/letsencrypt -v fine-configs:/etc/fine -e FINE_CONFIG_DIR=/etc/fine -e FINE_SOCKET_DIR=/run/fine --entrypoint sh my/certbot:1
# test auth hook full process with certonly command
#    certbot revoke --staging --non-interactive --cert-name example.com
#    certbot certonly --preferred-challenges dns --manual --manual-auth-hook /auth.py --manual-cleanup-hook /auth.py --staging --non-interactive -d example.com
# renew container: docker run -d --name acme1 -v certificates:/etc/letsencrypt -v certbot-libs:/var/lib/letsencrypt -v certbot-logs:/var/log/letsencrypt -v fine-configs:/etc/fine my/certbot:1
# update auth hook: docker cp certbot-auth-hook.py acme1:/auth.py
# update setup script: docker cp certbot-create-cert.py acme1:/create.py
# update schedule script: docker cp certbot-renew-schedule.py acme1:/schedule.py
# update deploy hook: docker cp certbot-deploy-hook.py acme1:/etc/letsencrypt/renewal-hooks/deploy/deploy.py
ENTRYPOINT ["/schedule.py"]

# reference https://github.com/docker-library/postgres/blob/master/18/alpine3.23/Dockerfile
# reference https://github.com/CircleCI-Public/cimg-postgres/blob/main/18.3/Dockerfile
# docker build --target postgres-build --tag my/postgres:build .
FROM alpine:3.23.3 AS postgres-build

# https://mesonbuild.com/Getting-meson.html
# https://github.com/mesonbuild/meson/releases
ADD meson-1.10.2.tar.gz /

# cannot clone https://git.postgresql.org/git/postgresql.git, looks like git is completly hated in this network
# https://ftp.postgresql.org/pub/source/v18.3/postgresql-18.3.tar.bz2
ADD postgresql-18.3.tar.bz2 /

RUN <<EORUN
set -ex
# rename subfolder in extract result
mv /meson-1.10.2 /meson
mv /postgresql-18.3 /postgres-src
# install dependencies
cat <<'EOCAT' > /etc/apk/repositories
https://mirrors.aliyun.com/alpine/v3.23/main
https://mirrors.aliyun.com/alpine/v3.23/community
EOCAT
apk update
# python3: run meson.py
# ninja: ninja
# according to https://github.com/FreskyZ/small/blob/main/devenv/llvm/Dockerfile
#   musl-dev: needed to build helloworld
# according to https://www.postgresql.org/docs/18/install-requirements.html
#   flex, bison: need binary, do they have a -dev package? oh, there is flex-dev
#   readline, readline-dev: why does this need binary?
#   openssl-dev, zlib-dev, icu-dev, zstd-dev: these need -dev
#   python3-dev: python3 package itself does not include -dev
#   util-linux-dev: this is for e2fs use as uuid library, if you ask
#   perl: this is build time tool, like the python3 package without -dev
#         not to be confused with the rejected perl-dev package for plperl language
# according to https://www.postgresql.org/docs/18/install-meson.html configuration options
#   liburing-dev
# according to ninja error
#   linux-headers
apk add --no-cache python3 musl-dev ninja openssl-dev flex bison readline readline-dev
apk add --no-cache icu-dev zlib-dev zstd-dev python3-dev util-linux-dev liburing-dev perl linux-headers
# use lld
ln -sf /usr/local/bin/ld.lld /usr/local/bin/ld
# add libc++ so to ld path
echo "/usr/lib:/usr/local/lib/x86_64-alpine-linux-musl" > /etc/ld-musl-x86_64.path
EORUN

# llvm compilers and runtime libraries
# see if you don't find it in the future https://github.com/FreskyZ/small/blob/main/devenv/llvm/Dockerfile
COPY --from=my/llvm:stage2 /llvm-install /usr/local

RUN <<EORUN
# configure
cd /postgres-src
/meson/meson.py setup /postgres-build --prefix=/postgres-install -Dnls=disabled -Dplperl=disabled \
-Dplpython=enabled -Dpltcl=disabled -Dicu=enabled -Dllvm=enabled -Dlz4=disabled -Dzstd=enabled -Dssl=openssl \
-Dgssapi=disabled -Dldap=disabled -Dpam=disabled -Dbsd_auth=disabled -Dsystemd=disabled -Dbonjour=disabled \
-Duuid=e2fs -Dlibcurl=disabled -Dliburing=enabled -Dlibnuma=disabled -Dlibxml=disabled -Dlibxslt=disabled \
-Dselinux=disabled -Dreadline=enabled -Dzlib=enabled --backend=ninja -Ddocs=disabled -Ddocs_pdf=disabled \
--buildtype=release -Dcassert=false -Dtap_tests=disabled
# build
cd /postgres-build
ninja install
EORUN

RUN <<EORUN
# add some runtime dependencies to reduce COPY operations in next stage
# libc++
cp /usr/local/lib/x86_64-alpine-linux-musl/* /postgres-install/lib
# libllvm.so
cp /usr/local/lib/libLLVM.so.23.0git /postgres-install/lib
# libpython.so because no dedicated libs package available
cp /usr/lib/libpython3.12.so.1.0 /postgres-install/lib
EORUN
# check psql --version
# check postgres --version

# docker build --target postgres --tag my/postgres:1 .
FROM alpine:3.23.3 AS postgres

LABEL org.opencontainers.image.version=20260409

# all these files will be owned by root in result container,
# they are 755 so non root user can still run these commands
COPY --from=my/postgres:build /postgres-install /usr/local

# install dependencies
# scan runtime dependencies learned from official dockerfile:
# scanelf --needed --nobanner --format '%n#p' --recursive bin | tr ',' '\n' | sort -u
# scanelf --needed --nobanner --format '%n#p' --recursive lib | tr ',' '\n' | sort -u
# for now result is libc, libc++, libc++abi, icu, readline, ssl, liburing, zlib, zstd, python
# use https://pkgs.alpinelinux.org/contents to find whether package contains required file
RUN <<EORUN
set -ex
cat <<'EOCAT' > /etc/apk/repositories
https://mirrors.aliyun.com/alpine/v3.23/main
https://mirrors.aliyun.com/alpine/v3.23/community
EOCAT
apk update
apk add --no-cache icu-libs icu-data-full readline openssl liburing zlib zstd-libs
EORUN

# setup user
# about permission of home directory /var/lib/pgsql:
# official image make the home directory 1777
# the leading 1: Sticky Bit When applied to a directory, it prevents users from deleting
#   or renaming files they do not own, even if they have write permissions to the directory.
#   This is typically used on shared directories like /tmp
# the busybox adduser will set the home directory 2755
# the loading 2: setgid (Set Group ID) When applied to a directory, any new files or
#   subdirectories created within it will inherit the directory's group ownership, rather
#   than the creator's primary group.
# the difference should be ok when postgres server is run as postgres user
RUN <<EORUN
set -ex
# NOTE this is not man 8 groupadd, this is man 1 busybox
# -g: gid, -S: system group
addgroup -g 70 -S postgres
# -u: uid, -S: system, -D: no password, -G: group, -h: home, -s: shell
adduser -u 70 -S -D -G postgres -h /var/lib/pgsql -s /bin/sh postgres
# mkdir and chown, or else postgres cannot create files in these folders
install -d -o postgres -g postgres /var/lib/pgsql/logs
install -d -o postgres -g postgres /run/pgsql
EORUN

USER postgres
WORKDIR /var/lib/pgsql

# put configuration files in ~
# and later use initdb.sh to move them into ~/data after initdb
COPY --chown=70:70 --chmod=700 database-setup.sh /var/lib/pgsql/initdb.sh
COPY --chown=70:70 --chmod=600 database-auth.conf /var/lib/pgsql/pg_hba.conf
COPY --chown=70:70 --chmod=600 database-main.conf /var/lib/pgsql/postgresql.auto.conf
COPY --chown=70:70 --chmod=600 database-psqlrc /var/lib/pgsql/.psqlrc

# client tools use these to connect
# should be same as postgresql.auto.conf port
ENV PGPORT=6543
# should be same as postgresql.auto.conf unix_socket_directories
ENV PGHOST=/run/pgsql
# server tools use this to find server files
ENV PGDATA=/var/lib/pgsql/data

# no need to actually declare a volume which only creates
# a randomly named volume when you forget to -v and not remove the volume with --rm
# by the way,
# if you volume mount, these folders will keep existing owner and permission
# if you bind mount, these folders will inherit the owner and permission from local fs, and postgres will throw error
# VOLUME /var/lib/pgsql /var/lib/pgsql/data /run/pgsql

# official document says use SIGINT and long stop timeout
# see https://www.postgresql.org/docs/current/server-start.html
# TODO setup --stop-timeout in docker compose (no need to set in temp shell container)
STOPSIGNAL SIGINT

# setup dev env: docker volume create database && docker volume create database-logs && docker volume create database-sockets
# server shell: docker run -it --rm --name postgres-shell1 -v database:/var/lib/pgsql -v database-logs:/var/lib/pgsql/logs -v database-sockets:/run/pgsql --entrypoint sh my/postgres:1
# initialize: ./initdb.sh
# start service: docker run -d --rm --name postgres1 -v database:/var/lib/pgsql -v database-logs:/var/lib/pgsql/logs -v database-sockets:/run/pgsql my/postgres:1
# client shell: docker run -it --rm --name postgres-shell1 -v database-sockets:/run/pgsql --entrypoint sh my/postgres:1
# psql: docker run -it --rm --name postgres-shell1 -v database-sockets:/run/pgsql --entrypoint psql my/postgres:1
# run database test: docker run -it --rm --name finenode1 -v database-sockets:/run/pgsql -v.:/work -h FINE-NODE -w /work my/node:1
ENTRYPOINT ["postgres"]

# docker build --target backup --tag my/fine-backup:1 .
FROM node:25.8.2-alpine3.23 AS backup

# remember to change this before commit is enough,
# use automatic mechanism to record build time will invalidate cache
LABEL org.opencontainers.image.version=20260421

# copy these files are enough for backup and restore
COPY --from=my/postgres:build /postgres-install/bin/pg_dump /usr/local/bin/pg_dump
COPY --from=my/postgres:build /postgres-install/bin/pg_restore /usr/local/bin/pg_restore
# this is symlink in source container, and the copy operation copies the original file?
COPY --from=my/postgres:build /postgres-install/lib/libpq.so.5 /usr/local/lib/libpq.so.5

RUN <<EORUN
set -ex
cat <<'EOCAT' > /etc/apk/repositories
https://mirrors.aliyun.com/alpine/v3.23/main
https://mirrors.aliyun.com/alpine/v3.23/community
EOCAT
apk update
# libz, libzstd: pg_dump and pg_restore runtime dependencies
# by the way, you may want to use zstd instead of xz for tar,
# but the zstd package only contains zstd binary that statically links
# see https://pkgs.alpinelinux.org/contents?file=&path=&name=zstd&branch=edge&repo=&arch=
apk add --no-cache xz zlib zstd-libs
# install in global to avoid package.json and node_modules
npm install -g yaml
# directory for database dump files
mkdir -p /data/base
EORUN

# should be same as in my/postgres
ENV PGPORT=6543
# should be same as in my/postgres
ENV PGHOST=/run/pgsql

WORKDIR /work
ADD alioss.ts /work/alioss.ts
ADD backup-schedule.ts /work/schedule.ts

# docker run -it --rm --name backup1 -v database-sockets:/run/pgsql -v /etc/fine:/etc/fine -v ./node_modules:/work/node_modules -e FINE_CONFIG_DIR=/etc/fine -e BACKUP_LOGS_DIR=/data/backup-logs --entrypoint sh my/fine-backup:1
# node backup.ts
# docker run -d --rm --name backup1  -v database-sockets:/run/pgsql -v /etc/fine:/etc/fine -v ./node_modules:/work/node_modules -e FINE_CONFIG_DIR=/etc/fine -e BACKUP_LOGS_DIR=/data/backup-logs my/fine-backup:1
ENTRYPOINT ["node", "schedule.ts"]
