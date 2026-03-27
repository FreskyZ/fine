# MySQL Setup

1. download deb package from 'https://dev.mysql.com/downloads/repo/apt' or something like this
2. install

```sh
$ sudo dpkg -i /path/to/that.deb 
$ sudo apt update
$ sudo apt install mysql-server # have interactive configuration
```

NOTE that vscode extension SQLTools and SQLTools MySQL does not support new authentication,
select legacy when configuration or use this to change setting

```sql
ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'password';
flush privileges;
```

3. maintainence

```sh
$ systemctl status mysql # to check status or use start/stop to start/stop
$ mysql --password # to login from shell
```

# Database Setup

### Build

build from source

- download meson build from github: https://github.com/mesonbuild/meson/releases
- download postgres source code https://ftp.postgresql.org/pub/source/v18.3
- build: docker build --target postgres-build --tag my/postgres:build .
- build runtime environment: docker build --target postgres --tag my/postgres:1 .
  this is for now 260m image size comparing to official postgres:18-alpine 400m image size

### Initialize

- docker run -it --rm --name postgres1 -v fine-database:/var/lib/pgsql --entrypoint /bin/sh my/postgres:1
- initdb --locale-provider=icu --locale=en_US.utf8
  use --locale-provider or else it default to libc, while musl libc does not have locale support,
  it's ok to see WARNING: no usable system locales were found,
  according to https://github.com/docker-library/postgres/issues/1311#issuecomment-3756316336
  and https://gitlab.alpinelinux.org/alpine/aports/-/blob/3.23-stable/main/postgresql18/dont-use-locale-a-on-musl.patch,
  this warning is because alpine does not have a command called locale, this does not affect actual locale setups so ok
- use pg_ctl start -l startlog to start and test in shell, don't forget to pg_ctl stop -m fast before exit shell
- pg_ctl status, status, also see cat data/postmaster.pid
- createuser fine, the default values for createuser seems exactly design for normal no previledge application user
  list users: SELECT * FROM pg_roles;
- createdb fine --owner fine
- psql, run with linux user posgres this will login with database user postgres and database postgres
- psql fine fine, connect with database user fine and connect to database fine, now you can run normal ddl and queries

psql meta commands, also see https://www.postgresql.org/docs/18/app-psql.html

- \c database user, reconnect, also for mysql and mssql's USE database
- \conninfo, connection info
- \!, run command or open a subshell -- why is this red in vscode markdown file

### Server Configuration

TODO
TODO how to disable all other access except local unix domain socket

### Backup and Restore

TODO
