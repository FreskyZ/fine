set -ex

initdb --locale-provider=icu --locale=en_US.utf8 --no-instructions

cp postgresql.auto.conf data
cp pg_hba.conf data

pg_ctl start -l startlog
createuser fine
createdb fine --owner fine
