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

NOTE that if database is specified in SQLTools setting, the very first `CREATE DATABASE` should be executed in interactive shell