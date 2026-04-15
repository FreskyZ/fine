# Database Setup

beside numerous comparisons between postgresql and mysql,
postgresql official site home page https://www.postgresql.org doesn't have the word AI.
(sometimes have, but only in randomly appeared news titles or comments)

## Build

build from source, see https://www.postgresql.org/docs/18/installation.html
also see official image https://github.com/docker-library/postgres/blob/master/18/alpine3.23/Dockerfile

optional components

- no nls, why do I need error messages in other natural languages?
- no plperl, not interested in writing perl,
  note this is perl libraries and headers, which will become a runtime dependency,
  not to be confused with the perl program as build time tool similar to the python program
- plpython, interested in writing server side python TODO try this
- no pltcl, what is tcl?
- icu, need unicode support, by the way, there is no utf8mb4 issue in postgresql
- llvm, I happened to have an llvm build https://github.com/FreskyZ/small/tree/main/devenv/llvm,
  so use this as the runtime dependency and the c/c++ compiler in the build process
- no lz4, it looks like related to https://www.postgresql.org/docs/18/storage-toast.html,
  seems not related to this project
- zstd, wal compression should be useful to reduce disk usage TODO is this really useful?
- openssl, use for ssl connections, I assume this is also for password authentication
- no gssapi, no ldap, no pam, no bsd_auth, no curl (oauth)
  why do you need these advanced authentication schemes in the database? normally they are
  installed at client side (web server) and client use normal auth scheme to connect database
- no systemd, containers do not use systemd
- e2fs, official image use this as uuid library, ai says this is the normal selection,
  by the way, the apk package name is util-linux-dev, not something like uuid or e2fs
- liburing, should be good for performance, I assume
- no numa, not related to my cheap cloud machine
- no libxml, no libxslt, I will not use xml in these projects,
  if there is need for unstructured data, I'd like to use json not xml
- no selinux
- readline, strongly recommended for psql user exprience
- zlib, recommended to support compression in pg_dump related tools

other configuration options

- no need to specify extra cargs, cxxargs, linkargs, includedir, libdir, rpath
- specify system tzdata can reduce binary and container size, but I think the size of tzdata will
  make it not default available on alpine, and postgres default build process does not check
  difference between postgresql's own tzdata and system tzdata and suggest run tests if you are
  using it, so skip it for now, if you are interested in this in future, it can be installed with
  apk add tzdata
- disable docs and docs_pdf
- segment size, block size and wal block size is configured at build time,
  I assume their default value is good
- build type is release, other debug and test related options seems only needed for developing

build

- download meson build if you cannot access in docker build https://github.com/mesonbuild/meson/releases
- download postgres source code if you cannot access in docker build https://ftp.postgresql.org/pub/source/v18.3
- docker build --target postgres-build --tag my/postgres:build .
- docker build --target postgres --tag my/postgres:1 .

for now this is 260m image size comparing to official postgres:18-alpine 400m image size

## Initialize

first, docker run -it --rm --name postgres1 -v database:/var/lib/pgsql -v database-logs:/var/lib/pgsql/log -v database-sockets:/run/pgsql --entrypoint sh my/postgres:1

- initdb --locale-provider=icu --locale=en_US.utf8 --no-instructions
  - will read PGDATA environment variable set in container to initialize the database files
  - set locale-provider to icu or else it default to libc, it seems that musl libc does not support
    locale, but not sure whether use libc locale will result in error when using cjk characters or emoji
  - set locale to en_US and utf8, this will set some locale settings in generated postgresql.conf
    to reasonable value, not sure what happens to cjk and emoji without this setting
  - no-instruction suppress some not useful output
  - it's ok to see WARNING: no usable system locales were found,
    according to https://github.com/docker-library/postgres/issues/1311#issuecomment-3756316336
    and https://gitlab.alpinelinux.org/alpine/aports/-/blob/3.23-stable/main/postgresql18/dont-use-locale-a-on-musl.patch,
    this warning is because alpine does not have a command called locale, this does not affect actual locale setups so ok
- pg_ctl start
  - no need to -l start-output because it will only contain 2 lines that output is redirect to log file
    with log_destination setting and logging_collector enabled, so no need to create a dedicated file to hold that
  - check check start status by pg_ctl status, also can check data/postmaster.pid file
  - pg_ctl stop -m fast for a normal fast stop, it is needed if you run pg_ctl start in a shell
    in a container and want to quit the container to start server process in another container
- createuser fine
  - there are many options for this command line tool or create user sql statement,
    but the default values seems exactly designed for normal application user, so no need to use them
  - list users: SELECT * FROM pg_roles;
  - grant group role to user: GRANT group_role TO user1, ...; REVOKE group_role FROM user1, ...;
  - see more at https://www.postgresql.org/docs/18/app-createuser.html and https://www.postgresql.org/docs/18/sql-createrole.html
- createdb fine --owner fine
  - there are many options for this command line tool or create database sql statement,
    but the default values seems good for a normal application database
  - by default new database is a clone of template1 database,
    you can create objects in template1 to make it available in all new databases,
    the template1 database contains all pg_* tables and related objects, that's why a
    postgresql connection is associated with a database but you always can access them,
    this is not similar to sql server that you always can access the dbo.master database
  - the default created postgres database is also a clone of template1 database,
    which makes it not special and can be removed? I'm not doing this because if you do that
    all following command line tools will need to specify database name to connect to work
- psql, test connection or do some manual setup
  - psql, run with linux user postgres will login with database user postgres and connect to database postgres
  - psql fine fine, login with database user fine and connect to database fine
  - \?, help meta commands
  - \h, help sql syntax
  - \q, quit, or quit a script in \i
  - \c databasename username, reconnect to another database as another user,
    postgres connection is fixed with a database, to connect to another database you need to
    reconnect with different parameter, this corresponds to mysql and mssql USE DATABASE;
  - \conninfo, connection info
  - \l, list databases, short hand of SELECT FROM pg_database, this corresponds to mysql SHOW DATABASES;
  - \!, run shell command, or open a subshell when no parameter
  - \r, reset, clear screen
  - \i sqlfile, include a sql file to run
  - \o filename, output following query results to a file, or disable without parameter
  - \pset, set format parameter, or display current format parameters without parameter
    - \pset x, toggle expanded mode, useful for query results with many columns that does not fit in shell width
    - \pset format csv, set query result to be csv, good to use with \o result.csv
    - \pset null '(null)', useful for distinguish null and empty string
    - \pset title 'title', set title for following queries
    - and many other format parameters
  - \parse statement_name, e.g. SELECT $1 \parse stmt1, create a prepared statement
    - \w filename, save the prepared statement to file
    - \bind, bind query parameters, e.g. INSERT INTO tbl1 VALUES ($1, $2) \bind 'first value' 'second value' \g
    - \bind_named, bind query parameters in named prepared statement, e.g. \bind_name stmt1 'first value' 'second' \g
    - close_prepared statement_name, close
    - \g, send current query,
    - \g filename, output to file,
    - \g option=value, similar to \pset but only for this query
  - \set, set global variable value, or display variable values without parameter
    - \unset, unset global variable
    - \echo :VARIABLE, display variable value
    - ERROR: 'true' or 'false'
    - SQLSTATE: sql state
    - ROW_COUNT: affected row count
    - LAST_ERROR_MESSAGE, LAST_ERROR_SQLSTATE, last error
    - many other default created variables, most of them are for information
  - \d, list really many kind of information
    - \d, without parameters display top level normal objects, tables, views, etc., similar to mysql SHOW TABLES;
    - \d table_name, display table columns and indexes, similar to mysql SHOW CREATE TABLE
  - see more at https://www.postgresql.org/docs/18/app-psql.html

collect these commands and add to database-setup.sh to initialize a database

put database-setup.sh and postgresql.auto.conf and pg_hba.conf in ~ directory in image,
when container is started with empty volume, these files, although masked by volume mapping,
will be copied into the volume if it's empty according to docker default setting, and you can run
initdb.sh to create database files, put configuration files and create application user and database,
if you start the container with volume with existing database files, these files will not by copied
into the volume, which will not waste disk and make confusion

by the way, add a .psqlrc file to customize psql prompt to make it more consistent with other environments

## Server Administration

server admin topics ordered according to config sections, see more at https://www.postgresql.org/docs/18/admin.html

### Connection Configuration

for postgresql.conf, see https://www.postgresql.org/docs/18/runtime-config-connection.html

- disable TCP connections: listen_addresses = '', then other tcp and ssl settings is not used
- set port to some value other than default
- unix socket directory is mapped by volume,
  default value is /tmp but map volume to /tmp looks strange, so change to /run/pgsql,
  no need to handle permissions and group because now web server process is root!
- authentication method is trust for now so authentication settings are not used

for pg_hba.conf and pg_ident.conf,
see https://www.postgresql.org/docs/18/auth-pg-hba-conf.html
and https://www.postgresql.org/docs/18/auth-username-maps.html, 

- keep only local by commenting out the default generated TCP related entries
- no need to keep replication related entries because I'm not using replication and pg_basebackup
- no need to use pg_ident.conf, there is no other system user in the containers
- check by SELECT * FROM pg_hba_file_rules after setting;

### Logging and Error Reporting

for postgresql.conf, see https://www.postgresql.org/docs/18/runtime-config-logging.html

- default logging destination is stderr, it is not convenient to view stderr by docker logs,
  and is lost when container is removed, add csvlog and enable logging collector to use csv logs,
  the current logging file name cannot be found in ~/data/current_logfiles
- change log file name to be more consist with current existing name pattern: log_filename = 'postgresql-%y%m%d.log'
- default log level log_min_message = WARNING and log_min_error_statement = ERROR looks good
- set log_min_duration_statement to 250ms to see long running queries, will this happen in this small application?
- set application_name in client sessions to distinguish different client application
- log connections by log_connections = 'authorization, setup_durations'
  and log disconnections by log_disconnections = on
- other what-to-log configuration items default values should be good, I guess
- TODO maybe need to remove old logs by external tools or in backup schedule

### Write Ahead Logs

see https://www.postgresql.org/docs/18/wal-configuration.html
see https://www.postgresql.org/docs/18/runtime-config-wal.html
see also https://learn.microsoft.com/en-us/sql/relational-databases/sql-server-transaction-log-architecture-and-management-guide?view=sql-server-ver17
see also? https://dev.mysql.com/doc/refman/8.4/en/innodb-redo-log.html

- first, ensuring data is safely stored in non-volatile storage over abstraction layers like operating systems,
  disk drivers and hardware implementation details is difficult, postgres use *Write Ahead Logs* (WAL) to record
  operations before they are applied to actual data files, writing records sequentially to a single file is more
  reliable than manipulating multiple data files
- when you try to commit a transaction that updates some data, the expected changes to data files are collected
  and encoded as wal records, the detail level of these records is controlled by `wal_level`, default to replica
  to support wal archiving and streaming replication, a higher level logical support logical replication, a lower
  level minimal to reduce disk usage and improve performance but only support crash recovery
- if the transaction is allowed to commit (like after concurrency control), these wal records are saved into
  dedicated shared memory, sized by `wal_buffers`, which have default size 1/32 of `shared_buffers`, which default
  value seems to be 128m, result in default wal buffer size 4m, but wal_buffer itself says typical value 16m?
- if you disable `synchronous_commit` in transaction or session setting, the transaction is regarded as completed
  here and report to client side, improving performance especially for small transactions with risk of losing data
  if server crash happens here
- a dedicated process, called wal writer, is responsible for flushing wal records, it is waked after a sleep
  of `wal_writer_delay` miliseconds, default 200ms, after previous activation, or triggered if accumulated size of
  records reach `wal_writer_flush_after`, default 1mb, or set to 0 to always trigger a flush whenever a transaction
  completes, before initiating a flush, the writer may wait for other parallel transactions to complete
  if `commit_delay` is configured and active transaction count is at least `commit_sibling`, reducing io operations
  and potentially improving time gap between wal record flushing for other transactions, the records to be stored
  may be compressed if `wal_compression` is configured, using pglz (builtin) or lz4 or zstd when related options is
  configured at postgres build time (not sql build time)
- wal records are stored in wal segment files, whose size is configured at initdb command with `--wal-segsize`,
  if current segment is full, an old file is recycled if `wal_recycle` is enabled (by default), avoiding file
  creation/deletion overhead, if recycle is not enabled, old segment file may be removed but at least
  `min_wal_size` size of files are preserved for usage spikes, if no recyclable slot, a new segment file is created
  if total size of segment files is below `max_wal_size`, default 1GB, but usage spikes, failing archive commands,
  or replication slots may cause the size temporary exceeds the soft limit
- transactions without async commit is regarded as completed after wal records is flushed
- a dedicated process, called checkpointer, is responsible for flushing changes of data files into storage, it is
  waked after a sleep of `checkpoint_timeout` seconds after previous activation, default 5min, or triggered if
  accumlated wal records is exceeding max_wal_size, or accumlated changes of data exceeds `checkpoint_flush_after`
  size, making wal segment files recyclable, the io operations will be spread over a time period controlled by
  `checkpoint_completion_target` parameter, which default to 0.9 means the io operations are nearly spread all over
  the time period between 2 checkpoints, if checkpoint happens too frequently and is lower than `checkpoint_warning`
  seconds, a warning is emitted indicating insufficient `max_wal_size` for current traffic
- the flush operations will `wal_sync_method` configured method to confirm data is written to non-volatile storage,
  it is by default automatically selected according to current environment, this can be disabled by set `fsync` to
  off, allowing data corruption to happen if server crash happens, so why is there a so dangerous option?

for now

- set wal_level = minimal because I'm not using replication
- use wal_compression because I compiled with that option
- use async commit for not important transactions

### Concurrency Control

the you-know-who topic in school course and interviews, see https://www.postgresql.org/docs/18/mvcc.html

first, the multithread? data racing? problems can be categorized into

- dirty read, a transaction reads data written by a concurrenct uncommited transaction
- nonrepeatable read, a transaction reads data again and
  finds that data is modified by another committed transaction
- phantom read, a transaction rerun query and finds the result row set is different because of changes by
  another committed transaction, the difference is that nonrepeatable read emphasis value inside a record
  is changed and phantom read emphasis row set is different
- serialization anomaly, the result of successfully committing a group of transactions
  is consistent with all possible orderings of running these transactions one at a time,
  e.g. create table (id, value), initial data values (1, 'black'), (2, 'white'),
  transaction 1: update table set value = 'white' where value = 'black';
  transaction 2: update table set value = 'black' where valeu = 'white';
  and they result in (1, 'white'), (2, 'black'),
  while all possible results of running serially is (1, 'white'), (2, 'white') or (1, 'black'), (2, 'black'),
  you may say this is because the update statement is phantom read, but this is because the transaction level
  is now repeatable read so phantom read is prohibited so you always get result set before these transactions

then, in postgresql, transaction isolation levels

- `read uncommitted` is same as `read committed` that does not allow dirty read, but nonrepeatable read,
  phantom read and serialization anomaly may happen
- `repeatable read` does not allow nonrepeatable read and phantom read, but serialization anomaly may happen
- `serializable` does not allow all these kinds of data racing problems

default value, configured in postgresql.conf, default_transaction_isolation is read committed

or by explicit locking
from my understanding and experience, mssql SELECT WITH (UPDLOCK, ROWLOCK) is SELECT FOR UPDATE here,
others see https://www.postgresql.org/docs/18/explicit-locking.html when need

### Client Connection Defaults

may be useful to set at session level or transaction level,
see https://www.postgresql.org/docs/18/runtime-config-client.html

- default_transaction_isolation default to read committed
- statement_timeout default to no timeout
- transaction_timeout default to no timeout, idle_in_transaction_session_timeout default to no timeout,
  may be useful if client side have error
- idle_session_timeout default to no timeout, client side's pool's idle timeout may be more useful
- datestyle,
  this may be important for client libraries to handle date, update: client library works ok by default,
  the initdb command initialize this to iso for output, mdy for input, change to more natural value iso+ymd
- intervalstyle, this may be important for client libraries to handle datetime and interval, check when used
- timezone, default to UTC according to initdb parameters
- extra_float_digits, may affect client library, check when used, update: looks like a compatibility option
- locale related settings default to en_US.UTF8 according to initdb parameters

### Other Configuration Items

- system resource usage options should be "you'd better not touch unless really needs"
- replication, streaming replication and logical replication is not needed
  in this single machine single process web server with single machine single instance database
- query tunning are for query tunning, normally not for editing in postgresql.conf file, by the way, jit is here
- monitoring and statistics, there is really not much activity in this small application, so keep default
- vaccuming
  - auto vaccuming should be enough for this small application
  - TODO try manual ANALYZE invocation when there is enough data
- lock configuration, I assume will not use lock in this small application
- compatibility options, should not related to this new? application
  - array_nulls, why do some old applications need to regard \[NULL] as \['NULL']?
  - standard_conforming_strings default to on, which is good
  - quote_all_identifiers may be useful for pg_dump TODO do I need pg_dump?
  - transform_null_equals, no need
- error handling part's restart_after_crash handled by docker so this should be disabled,
  but the container is removed after crash so this option become meaningless so no need to manually disable?

### Backup and Restore

1, pg_dump, see https://www.postgresql.org/docs/18/app-pgdump.html

- work when server is running
- not lock database or table
- generate plain sql for schema and data
- not suitable for production database regular backup
- backup `pg_dump dbname > dumpfile.sql`, restore `psql -X dbname < dumpfile.sql`
- default -Fp generates normal sql statements to create table and insert data,
  -Fc custom generates a binary file, -Fd generates a directory of binary files, TODO try pg_restore

2, file system backup, see https://www.postgresql.org/docs/18/backup-file.html

- need server shutdown
- cannot select part of the objects to backup
- backup `tar cJf backup.tar.xz /var/lib/pgsql/data`, restore `tar xJf backup.tar.xz -C /`
- an empty database cluster have about 50m size of files TODO check size after insert 0.1m records

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

- based on pg_basebackup approach
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
  
result backup approach of database and other containers TBD

## SQL Syntax Comparison

these items are arbitrary ordered without categorization

- dedicated ip address type that holds both ipv4 and ipv6
  `create table "table_name" ("last_access_address" inet)` vs mysql"`last_access_address` varchar"
- default primary key name is `{tablename}_pkey`
  default forieng key name is `{foreign table}_{reference table}_{reference key}_fkey`
  vs mssql `PK__<TableName>__<HexadecimalString>` and need to find by
  `SELECT name FROM sys.key_constraints WHERE type = 'PK' AND parent_object_id = OBJECT_ID('YourTableName');`
- allow insert id column by `GENERATED BY DEFAULT AS IDENTITY` vs mysql always allow vs mssql `SET IDENTITY_INSERT OFF`
- vs mysql `DATETIME` vs `TIMESTAMP` type vs mssql `DATETIME` vs `DATETIME2`? types,
  only have standard conforming `timestamp` type and `timestamp with time zone` type for date + time data
  with really many operators and functions at https://www.postgresql.org/docs/current/functions-datetime.html
  even an overlap operator? (start1, end1) OVERLAPS (start2, end2), (start1, length1) OVERLAPS (start2, length2)
- with date only type `DATE`, time only type `TIME` and dedicated interval type `INTERVAL`,
  vs mysql date only type `DATE`, no time only type and no interval type
  vs mssql date only type `DATE`, no time only type despite TimeOnly in .NET? and no interval type
- timestamp support up to year 294276AD?,
  date support up to year 5874897AD? low to year 4713BC? before sumerians build their countries?
  interval support up to 178000000 years? why do you need this? (mysql and mssql value limit is meaningless here)
- floating point support
  negative scales, e.g. `numeric(2, -3)` is between -99000 and 99000,
  and scale > precision, e.g. `numeric(3, 5)` is between -0.00999 and 0.00999,
  and why do you need up to 131072 digits before the decimal point up to 16383 digits after the decimal point?
  vs mysql and mssql's normal ieee float 64 precision and value limit
- alter column type `alter table "table_name" alter column "column_name" type ...`
  vs mysql "alter table `table_name` modify column `column_name` ..."
  vs mssql `alter table [table_name] alter column [column_name] ...`, I guess this type is easier for parsing
- set not null `alter table "table_name" alter column "column_name" set not null`
  and `alter table "table_name" alter column "column_name" drop not null`
  vs mysql "alter table `table_name` modify column `column_name` not null"
  vs mssql `alter table [table_name] alter column [column_name] not null`
- rename column `alter table "table_name" rename column "old_name" to "new_name"`,
  which is exactly same as my DSL design, hope you remember your design in future
  vs mysql same
  vs mssql `exec sp_rename`
- change default value `alter table "table_name" alter column "column_name" set default ...`
  vs mysql same
  vs mssql DECLARE @ConstraintName NVARCHAR(200);
  SELECT @ConstraintName = name
  FROM sys.default_constraints
  WHERE parent_object_id = OBJECT_ID(N'dbo.YourTableName')
    AND parent_column_id = COLUMNPROPERTY(OBJECT_ID(N'dbo.YourTableName'), 'YourColumnName', 'ColumnID');
  IF @ConstraintName IS NOT NULL
    EXEC('ALTER TABLE dbo.YourTableName DROP CONSTRAINT ' + @ConstraintName);
- boolean type `boolean`
  with boolean literal `true`, `false`, `yes`, `no`, `on`, `off`, `1`, `0`, and even `t`, `f`, `y`, `n`,
  supporting the most confusion pair `on` and `no` by the way, output as `t` or `f` by default
  vs mysql no boolean type but `BIT` type output `0x01` for true? vs mssql no boolean type but `BIT` type
- text array data type!
- standard conforming varchar types and the fundamental `text` type, allow index on text
  vs mssql `text` type not allow index
  vs mssql deprecated `text` type and recommending `varchar(max)` but not allow index
- varchar explicit size max is 10485760 with unlimited max size
  vs mysql varchar (not only explicit) size max 65536 bytes! so utf8mb4 is 16384 characters
  vs mssql varchar explicit size max 8000 and varchar (without size) max size 2gb
- compare string is case sensitive by default, or else use `WHERE column ILIKE value`
  vs mysql case insensitive by default,
  or else use `WHERE BINARY column = 'Value'`, what is binary? or "WHERE `column` COLLATE utf8mb4_bin = 'value'"
  vs mssql case insensitive by default, or else `WHERE MyColumn = 'TargetValue' COLLATE SQL_Latin1_General_CP1_CS_AS`
- concat string `text1 || text2` and `concat(text1, text2, ...)`
  vs mysql use only `concat(text1, text2, ...)`
  vs mssql use `text1 + text2` and `concat(text1, text2, ...)`
  and many other string operators and functions in https://www.postgresql.org/docs/current/functions-string.html
- regex match `text SIMILAR TO pattern`, or `regexp_like(text, pattern)` or `text ~ pattern` for posix regex?
  or functions like regexp_matches function, regexp_replace function, regexp_split_to_array function,
  or more in https://www.postgresql.org/docs/18/functions-matching.html
  vs mysql RLIKE
  vs mssql REGEXP_LIKE in sql server 2025? in Nov 2025? that means in most of the lifetime of this project,
  for most of the times I manually write sql, except recent weeks, sql server is not supporting regex match at all
- skip constraint `alter table "table_name" disable trigger trigger_name` or `...disable trigger all`,
  or `set constraints constraint_name deferred` or `set constraints all deferred` for constraints created with `deferrable`,
  vs mysql `set foreign_key_checks = 0`, `set unique_checks = 0` for global level
  or `ALTER TABLE table_name ALTER CHECK constraint_name NOT ENFORCED;` for specific check constraint,
  and cannot disable specific fk
  vs mssql `ALTER TABLE TableName NOCHECK CONSTRAINT ConstraintName;` or `ALTER TABLE TableName NOCHECK CONSTRAINT ALL;`
- exclusive constraint
  `CREATE TABLE circles (c circle, EXCLUDE USING gist (c WITH &&));`
  that c in all rows compare with && will not return true,
  vs mysql and mssql does not have this kind of constraint and actually does not have so many operators
- user defined functions in check constraint vs mysql not support vs mssql support
- table inheritance! `create table ... inherits (parent_table_name, ...)`
  select from parent_table_name by default selects all inherit tables,
  multiple inheritance! require same name column to be same data type and same many other properties
- convenient join `from t1 join t2 using ("column_name", ...)` for using same name column equals
- sort regarding null `order by column1 asc nulls first` and `nulls last`
  vs mysql default nulls first in asc, default nulls last in desc,
  reverse by `ORDER BY column_name IS NULL, column_name ASC` and `ORDER BY column_name IS NULL, column_name DESC`
  vs mssql same default, reverse by `ORDER BY CASE WHEN YourColumn IS NULL THEN 1 ELSE 0 END, YourColumn ASC`
- paging for limit + offset,
  vs mysql same
  vs mssql row number over order by partition by or offset + fetch syntax
- a standalone values expression `values (1, 'one'), (2, 'two'), (3, 'three')`
  short hand of `select 1, 'one' union select 2, 'two' union select 3, 'three'`
- efficient jsonb type for store, query and manipulating,
  really many json operators and functions https://www.postgresql.org/docs/18/functions-json.html
  vs mysql document length https://dev.mysql.com/doc/refman/9.6/en/json.html
  vs mssql json type is new in 2025?
  again? https://learn.microsoft.com/en-us/sql/t-sql/data-types/json-data-type?view=sql-server-ver17
- why do you need a `pg_sleep` function in database?
- implicit conversion issue,
  for text column with \d contents, where text_column = number literal will raise error
  vs mysql and mssql's will convert text_column to number and failed to use index
- get insert id `RETURNING "id"`, the id part is same syntax as select, can return anything from affected rows
  vs mysql `LAST_INSERT_ID()`
  vs mssql `SCOPE_IDENTITY()` or `@@IDENTITY` 
- integer division SELECT 5 / 2 result in 2, floating point division 5.0 / 2 result in 2.5
  vs mysql division SELECT 3 / 5 result in 0.6, integer division 5 DIV 2 result in 2
  vs mssql same

the list is not exhausitive...

## Client Side Programming

use node-progres, https://node-postgres.com/, which is npm i --save pg,
amazingly this organization is allowed to use this short name,
that's because this library is created in Nov 2010, by the way, npm is likely created in 2009

the PoolConfig object is like mysql PoolOption, e.g.
`{ "host": "/run/fine", "port": 6543, "user": "fine", "database": "fine", "application_name": "core"}`

then use `pool.query` to run sql statements, use `$1`, `$2`, etc. for parameters,
use result.rows for result rows, use `RETURNING "id"` syntax and `result.rows[0].id` for insert id,
see more examples in database-test.ts
