# Database Setup

## Build

build from source, see https://www.postgresql.org/docs/18/installation.html

- download meson build from github: https://github.com/mesonbuild/meson/releases
- download postgres source code https://ftp.postgresql.org/pub/source/v18.3
- build: docker build --target postgres-build --tag my/postgres:build .
- build runtime environment: docker build --target postgres --tag my/postgres:1 .
  this is for now 260m image size comparing to official postgres:18-alpine 400m image size

## Initialize

- docker run -it --rm --name postgres1 -v fine-database:/var/lib/pgsql --entrypoint /bin/sh my/postgres:1
- initdb --locale-provider=icu --locale=en_US.utf8
  - use --locale-provider or else it default to libc, while musl libc does not have locale support,
  - it's ok to see WARNING: no usable system locales were found,
    according to https://github.com/docker-library/postgres/issues/1311#issuecomment-3756316336
    and https://gitlab.alpinelinux.org/alpine/aports/-/blob/3.23-stable/main/postgresql18/dont-use-locale-a-on-musl.patch,
    this warning is because alpine does not have a command called locale, this does not affect actual locale setups so ok
  - use --no-instructions to avoid the pg_ctl start help message in automation setup
  - see more at https://www.postgresql.org/docs/18/app-initdb.html
- use pg_ctl start -l startlog to start and test in shell, don't forget to pg_ctl stop -m fast before exit shell
  - pg_ctl status, status, also see cat data/postmaster.pid
  - see more at https://www.postgresql.org/docs/18/app-pg-ctl.html
- createuser fine, the default values for createuser seems exactly design for normal no previledge application user
  - list users: SELECT * FROM pg_roles;
  - grant and revoke user group: GRANT group_role TO user1, ...; REVOKE group_role FROM user1, ...;
  - see more at https://www.postgresql.org/docs/18/app-createuser.html and https://www.postgresql.org/docs/18/sql-createrole.html
- createdb fine --owner fine
  - add objects to template1 to make them available in all createdb result,
  - in theory you can --template otherdatabase to clone database, but what's the purpose?
  - the template1 database contains all builtin pg_* tables and objects,
    that's why normal databases also can access these builtin tables,
    and the postgres database is also a clone of template1 database, this makes it not special like dbo.master database
  - see more at https://www.postgresql.org/docs/18/app-createdb.html and https://www.postgresql.org/docs/18/sql-createdatabase.html
- psql, run with linux user posgres this will login with database user postgres and database postgres
  - psql fine fine, connect with database user fine and connect to database fine, now you can run normal ddl and queries
  - see more at https://www.postgresql.org/docs/18/app-psql.html

bt the way some of psql meta commands

- \?, help these meta commands
- \h, help sql syntax
- \q, quit, or quit the script in \i
- \c database user, reconnect, this is mysql and mssql's USE database;
- \conninfo, connection info
- \l, list databases, short hand of SELECT FROM pg_database; this is mysql's SHOW DATABASES;
- \!, run command or open a subshell when no parameter -- why is this red in vscode markdown file
- \r, reset, cls
- \i sqlfile, include, run a sql file
- \o filename, output following query result to file, or disable with no parameter
- \w filename, save last query
- \pset, with no parameter print current format parameters, or else set format parameter
  - \pset x to toggle expanded mode, useful for not-fit-in-shell-width tables
  - \pset format csv, should be very useful to export query result with \o result.csv + query + \o
  - \pset null '(null)', to distinguish null and empty string
  - \pset title 'title', set title for following queries, use empty value to clear
- \parse statement_name, e.g. SELECT $1 \parse stmt1, create a prepared statement
  - \bind, bind query parameters, e.g. INSERT INTO tbl1 VALUES ($1, $2) \bind 'first value' 'second value' \g
  - \bind_named, bind query parameters in named prepared statement, e.g. \bind_name stmt1 'first value' 'second' \g
  - \close_prepared statement_name, close
  - \g, send current query,
    \g filename, output to file,
    \g option=value, similar to \pset but only for this query
- \set, with no parameter display current variables, \set name value, set value, \set name, set empty value,
  - \unset name, unset variable
  - \echo :VARIABLE to display variable value
  - ERROR: $?, 'true' or 'false'
  - SQLSTATE: sql state
  - ROW_COUNT: row count
  - LAST_ERROR_MESSAGE, LAST_ERROR_SQLSTATE: last error
- \d, list many kind of things
  - \d with out parameters display top level normal objects, tables, views, etc.
  - \d tablename to display columns and indexes

## Server Administration

see https://www.postgresql.org/docs/18/admin.html

### Connection Configuration

see https://www.postgresql.org/docs/18/runtime-config-connection.html, for postgresql.conf 

- disable TCP connections: listen_addresses = '', then other tcp and ssl settings is not used
- set port to some value other than default
- unix socket directory is mapped by volume,
  default value is /tmp but map volume to /tmp looks strange, set it to /run/pgsql,
  no need to handle permissions and group because now web server process is root!
- authentication method is trust so authentication settings are not used

see https://www.postgresql.org/docs/18/auth-pg-hba-conf.html
and https://www.postgresql.org/docs/18/auth-username-maps.html, for pg_hba.conf and pg_ident.conf

- keep only local by comment out the default generated allow all localhost TCP connection entries
- no need to keep replication related entries because I'm not using replication and pg_basebackup
- no need to use pg_ident.conf, there is no other system user in the containers
- TODO check by SELECT * FROM pg_hba_file_rules after setting;

### Logging and Error Reporting

see https://www.postgresql.org/docs/18/runtime-config-logging.html, for postgresql.conf

- default logging destination is stderr, it is not convenient to read docker logs, and is lost when container is removed,
  so set log_destinations = 'stderr, csvlog' and logging_collector = on, current log file recorded in data/current_logfiles
- change log file name to be more consist with my existing name pattern: log_filename = 'postgresql-%y%m%d-%H%M%S.log'
- default log rotation time is 1 day which is ok, my existing log rotation strategy is not checking file size,
  but the default log rotation size is 10m and I assume there is not so many logs in this small application so leave it default
- default log level log_min_message = WARNING and log statement level log_min_error_statement = ERROR looks good
- set log_min_duration_statement to 250ms to see long running queries, is this kind of query really exist in this application?
- TODO set application_name in client sessions
- log connections by log_connections = 'authorization, setup_durations' and log_disconnections = on
- check when need more information in log line prefix
- other what-to-log configurations see their own sections
- TODO seems need to remove old log by external tools

### Write Ahead Logs

see https://www.postgresql.org/docs/18/wal-reliability.html

TODO review this section

first, you'd like to ensure data is actually saved into non-volatile storage,
which is difficult accoss operating system abstractions, hard disk drivers and hardwares implementation details, 

then, you use *Write Ahead Logs* (WAL) to record operations to actual data files before actually write data,
writing a transaction log as a single chunk of data into single file is more reliable than manipulating a lot of data files

wal records have different detail levels, set `wal_level` = minimal for recover from crashes,
= replica to support streaming replication or point in time recovery, = logical to support logical replication

when you write and invoke some sql statements and committing a transaction, you can set `synchronous_commit` to off
to make an asynchronous commit, so it is regarded as completed before wal records or actual data actually saved,
with risk of lost data if system crash between async commit and actually save data, if this is ok to you

then the transaction is processed into records about how to change the actual data files, written into shared memory
whose size is controled by `wal_buffers`, then the wal writer, sleep for `wal_writer_delay` miliseconds, or triggerred
by wal record size exceeding `wal_writer_flush_after` configured size, will try to initiate a wal flush, it may wait
for a `commit_delay` time if there are at least `commit_sibling` transactions active, in case they commit in this time
and new wal records arrives in buffer, decreasing time gap between commit and wal record flush or reduce wal flush io,
wal records are saved in wal segment files, which size is set when initdb with `--wal-segsize` parameter, if current wal segment file is full, a new file is created or an old file
is reused, the reusable old files come from wal records actually applied to data files and by default `wal_recycle` is
enabled so the used file is preserved to avoid create file and delete file io operation overhead, if recycle is not
enabled, at least `min_wal_size` size is preserved to handle spikes in wal usage, the records may be compressed if
`wal_compression` is enabled before write into wal files, the total wal file size normally will not exceed
`max_wal_size` limit unless there are really many wal records created in a short time, if this happens, or if the
checkpointer sleeps for `checkpoint_timeout` seconds, or the not flushed data riches `checkpoint_flush_after` size,
the checkpointer will start to flush actual data into data files, make wal records unneeded and wal files removed or
marked as recycable, the checkpointer will spread io operations in a timespan `checkpoint_completion_target` as a
fraction of total time between checkpoints, whose default value 0.9 means spreading io operations across almost all of
the available interval, after flush data into wal files or data files, unless you set `fsync` to false to expect data
corruption happens, fsync or related functions specified in `wal_sync_method` will be used to check data is actually
persistent in non-volatile storage, until now the gap between database application and disk closes

for now, I'd like to try

- set wal_level to minimal because I'm not using replication,
- use async commit in not important queries
- use wal_compression because I compiled that

### Client Connection Defaults

see https://www.postgresql.org/docs/18/runtime-config-client.html, that may be useful to set in session level

- default_transaction_isolation default to read committed -- finally meet something I previously know in this day
- statement_timeout default to no timeout
- transaction_timeout default to no timeout, idle_in_transaction_session_timeout default to no timeout,
  may be useful if client side have error
- idle_session_timeout default to no timeout, client side's pool's connection idle timeout may be more useful
- datestyle,
  this may be important for client libraries to handle date, TODO check client library date handling
  the initdb command initialize this to iso for output, mdy for input y/m/d, change to more natural iso, ymd
- interval this may be important for client libraries, check when used
- timezone default to UTC, good
- extra_float_digits, may affect client library, TODO check floating point format in client library
- locale related settings are en_US.UTF8, should be no problem for normal cases

### Other Configuration

- system resource usage options should be "you'd better not touch unless really needs"
- replication, streaming replication and logical replication is not needed
  in this single machine single process web server with single machine single instance database
- query tunning are for query tunning, normally not for editing in postgresql.conf file, by the way, jit is here
- monitoring and statistics, there is really not much activity in this small application, so skip
- vaccuming
  - auto vaccuming should be enough for this small application
  - TODO try manual ANALYZE invocation when there is enough data
- lock configuration, I assume will not use lock in this small application
- compatibility options, should not related to this new? application
  - array_nulls, why do some old applications need to regard \[NULL] as \['NULL;]?
  - backslash_quotes set to off to avoid accidentally write not standard string literal
  - standard_conforming_strings default to on, which is good
  - quote_all_identifiers may be useful for pg_dump TODO do I need pg_dump?
- error handling part's restart_after_crash handled by docker so this should be disabled,
  but the container is removed after crash so this option become meaningless so no need to manually disable?

### Backup and Restore

1, pg_dump, see https://www.postgresql.org/docs/18/app-pgdump.html

- work when server is running
- not lock database or table
- generate plain sql for schema and data
- not suitable for production database regular backup
- backup `pg_dump dbname > dumpfile.sql`, restore `psql -X dbname < dumpfile.sql`
- TODO try format -Fc and -Fd when there is data and try pg_restore

2, file system backup, see https://www.postgresql.org/docs/18/backup-file.html

- need server shutdown
- cannot select part of the objects to backup
- backup `tar cJf backup.tar.xz /var/lib/pgsql/data`, restore `tar xJf backup.tar.xz -C /`
- TODO learn the size of data directory when filled with data

3, builtin file system backup, pg_basebackup, https://www.postgresql.org/docs/18/app-pgbasebackup.html

- back when server is running
- work in replication
- need enable replication, use a user with replication permission, allow replication connection in pg_hba.conf
- cannot select part of the objects to backup
- check pg_stat_progress_basepack for progress
- backup `pg_basebackup -D targetdir`, not to be confused with common -D that
  points to data directory and can omit by PGDATA env var, this is target directory
- restore part see wal archiving part?

4, wal archiving and point-in-time recover, https://www.postgresql.org/docs/18/continuous-archiving.html

- based on pg_basebackup
- backup when server is running
- need wal_level > minimal, or >= replica
- save wal files to allow recover to any time point by replaying wal files
- not include postgresql.conf, pg_hba.conf and pg_ident.conf
- setup wal archiving
  - set archive_command and restore_command like
    archive_command = 'test ! -f /mnt/server/archivedir/%f && cp %p /mnt/server/archivedir/%f'
    restore_command = 'cp /mnt/server/archivedir/%f %p'
    %p is the full path of the file to backup, %f is the file name
  - return zero indicate successful backup, or else will try again later until success,
    if too many wal files waiting for archive command, the database server will eventually crash
  - test for file existing because a specific wal file may invoke archive_command again if it is used
    in crash recovery
  - always invoke the command with full wal segment file, if database is idle, the active segment file
    may be not full for very long time, use archive_timeout to handle that
- a very long instruction list to restore
  https://www.postgresql.org/docs/18/continuous-archiving.html#BACKUP-PITR-RECOVERY
  
5, a more lightweight strategy than pg_dump

that write a simple sql script utilizing psql meta commands to
format query result as csv and output to file, I'm not using this approach so there is no sample code for that

6, current concolusion, at the time of writing I need to recreate database from csv files from my old database,
so the selected strategy is...

*write a nodejs program* to restore data, schedule backups and manage backup data

complete version of backup and restore nodejs scripts will be in setup folder, I assume

## SQL Syntax Differences

TODO review this section

- dedicated ip address type that holds both ipv4 and ipv6: https://www.postgresql.org/docs/current/datatype-net-types.html
- default pk is {tablename}_pkey, default fk is `{foreign table}_{reference table}_{reference key}_fkey`
- GENERATED BY DEFAULT AS IDENTITY is easier than SET IDENTITY_INSERT OFF,
  you can directly update an identity column,
  ALTER TABLE your_table ALTER COLUMN id RESTART WITH 1001;
- no datetime and datetime2? types, timestamp support w/o tz, but why do you support -4713BC and 5874897AD?
  why do your interval support 1,7800,0000 years?
- floating point support negative scale, e.g. numeric(2, -3) is between -99000 and 99000,
  and larger scale than precision, e.g. numeric(3, 5) is between -0.00999 and 0.00999,
  why do you support up to 131072 digits before the decimal point; up to 16383 digits after the decimal point?
- alter table alter column type ..., why do mysql use modify column? and mssql does not use the TYPE
- alter table alter column set default, mysql is same, in mssql is
  DECLARE @ConstraintName NVARCHAR(200);
  SELECT @ConstraintName = name
  FROM sys.default_constraints
  WHERE parent_object_id = OBJECT_ID(N'dbo.YourTableName')
    AND parent_column_id = COLUMNPROPERTY(OBJECT_ID(N'dbo.YourTableName'), 'YourColumnName', 'ColumnID');
  IF @ConstraintName IS NOT NULL
      EXEC('ALTER TABLE dbo.YourTableName DROP CONSTRAINT ' + @ConstraintName);
- mysql does not have a boolean type? have to use 0x01 to represent true?
- finally you can directly declare a text[] data type! by the way, ai says sql server text type is deprecating?
- sql server varchar(here can only write 8000), or use max for 2gb, postgres character varying(here max 10485760)
  although normally you either deal with short strings less than 100 or even less than 10, and sometimes there
  is super long columns with 10000 or mb size of content, so both work ok, by the way mysql explicit max is 65536, same,
- mysql does not allow index on text, postgres varchar internally is text, all support, mssql cannot index on varchar(max)
- select string concat use ||, mysql use concat(col1, col2), mssql use col1 + col2 or concat(col1, col2)
- compare string is case sensitive by default, mysql and mssql is insensitive by default,
  pgsql should use "colume" ILIKE value
  mysql is using WHERE `column` = BINARY 'value' or  WHERE `column` COLLATE utf8mb4_bin = 'value' ?
- use SIMILAR TO for regex match, text~text for posix regex match?,
  regexp_matches function, regexp_replace function, regexp_split_to_array function,
  mysql use RLIKE, sql server have REGEXP_LIKE in sql server 2025? that means in most of the lifetime of this project,
  and for all the times that I manually write sql, except today, sql server is not supporting regex match

## Client Side Programming

use node-progres, https://node-postgres.com/,
which npm i --save pg, amazingly this organization is allowed to use this short name

TODO the config structure or connection string should be described here, I guess,
but normal query and managing part may be very easy so nothing special to talk here, I guess
