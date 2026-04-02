
# build: docker build --target certbot --tag my/certbot:1 .
FROM certbot/certbot:v5.4.0 AS certbot

# the evil pip install to global by default, which is convenient for this case
RUN pip install dnspython

WORKDIR /
# no need to put auth hook in /etc/letsencrypt, it is now tracked in git
COPY --chmod=700 certbot-auth-hook.py certbot-create-cert.py certbot-deploy-hook.py certbot-renew-schedule.py /
# cannot move deploy hook into /etc/letsencrypt here, or else it is masked by volume mounting
RUN mv certbot-auth-hook.py auth.py && mv certbot-create-cert.py create.py && mv certbot-deploy-hook.py deploy.py && mv certbot-renew-schedule.py schedule.py

# setup dev environment: mkdir testconfig testdata testlog testrun && cp ../real-config.json testconfig/config.json
# test shell: docker run -it --rm --name certbot1 -v ./testrun:/run/fine -v ./testconfig:/etc/fine -v ./testdata:/etc/letsencrypt -v ./testlog:/var/log/letsencrypt --entrypoint /bin/sh my/certbot:1
# test renew: docker run -d --name certbot1 -v ./testrun:/run/fine -v ./testconfig:/etc/fine -v ./testdata:/etc/letsencrypt -v ./testlog:/var/log/letsencrypt my/certbot:1
# update auth hook: docker cp certbot-auth-hook.py certbot1:/auth.py
# update setup script: docker cp certbot-create-cert.py certbot1:/create.py
# update schedule script: docker cp certbot-renew-schedule.py certbot1:/schedule.py
# update deploy hook: docker cp certbot-deploy-hook.py certbot1:/etc/letsencrypt/renewal-hooks/deploy/deploy.py
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
#   openssl-dev, flex, bison, readline, readline-dev, zlib-dev, icu-dev
#   zstd-dev: TODO try compress wal to reduce disk usage
#   perl: perl is used in build process like python
#   python3-dev: TODO try PL/Python
#   util-linux-dev: seems to be for uuid
#   no perl-dev: not interested in PL/Perl for now https://www.postgresql.org/docs/18/plperl-funcs.html
#   no lz4: seems https://www.postgresql.org/docs/18/storage-toast.html is not relavent to me
#   no curl-dev: why do I need OAuth to connect db?
#   no tcl: what is tcl?
# according to https://www.postgresql.org/docs/18/install-meson.html configuration options
#   liburing-dev
#   no libxml2-dev, libxlst-dev: no use of xml, if need some unstructured data I will use json
# according to ninja error
#   linux-headers
apk add --no-cache python3 musl-dev ninja openssl-dev flex bison readline readline-dev
apk add --no-cache icu-dev zlib-dev zstd-dev python3-dev util-linux-dev liburing-dev perl linux-headers
# use lld
ln -sf /usr/local/bin/ld.lld /usr/local/bin/ld
# add libc++ to ld path
echo "/usr/lib:/usr/local/lib/x86_64-alpine-linux-musl" > /etc/ld-musl-x86_64.path
EORUN

COPY --from=my/llvm:stage2-dylib /llvm-install /usr/local

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

# all these files are owned by root, they are 755 so non root user can still exec these commands
COPY --from=my/postgres:build /postgres-install /usr/local

# install dependencies
# scan runtime dependencies learned from official dockerfile:
# scanelf --needed --nobanner --format '%n#p' --recursive bin | tr ',' '\n' | sort -u
# scanelf --needed --nobanner --format '%n#p' --recursive lib | tr ',' '\n' | sort -u
# for now only find libc, libicu, libreadline, libssl, liburing, zlib, libzstd, libpython, libc++, libc++abi
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
RUN <<EORUN
set -ex
# this is not man 8 groupadd, see man 1 busybox
# -g: gid, -S: system group
addgroup -g 70 -S postgres
# -u: uid, -S: system, -D: no password, -G: group, -h: home, -s: shell
# about permission: official image make the home directory 1777
# 1777: Sticky Bit When applied to a directory, it prevents users from deleting or renaming files they do not own,
#       even if they have write permissions to the directory. This is typically used on shared directories like /tmp
# the busybox adduser will set the home directory 2755
# 2755:	setgid (Set Group ID) When applied to a directory, any new files or subdirectories created within it
#       will inherit the directory's group ownership, rather than the creator's primary group.
# should not be relavent when postgres server is run as postgres user and normal exec sh is postgres user
adduser -u 70 -S -D -G postgres -h /var/lib/pgsql -s /bin/sh postgres
# mkdir and chown, or else postgres cannot create file here
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

# if you volume from host fs, this folder will inherit the owner and permission,
# if you volume from docker volume, this folder will keep existing owner and permission
VOLUME /var/lib/pgsql

# official document says use SIGINT and long stop timeout
# see https://www.postgresql.org/docs/current/server-start.html
# TODO setup --stop-timeout in docker compose (no need to set in temp shell container)
STOPSIGNAL SIGINT

# docker run -it --rm --name postgres-shell1 -v fine-database:/var/lib/pgsql -v fine-sockets:/run/pgsql --entrypoint /bin/sh my/postgres:1
#   ./initdb.sh && psql
#   pg_ctl stop -m fast # if you'd like to visit this database again
# docker run -d --rm --name postgres1 -v fine-database:/var/lib/pgsql -v fine-sockets:/run/pgsql my/postgres:1
ENTRYPOINT ["postgres"]
