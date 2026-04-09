set -ex

initdb --locale-provider=icu --locale=en_US.utf8 --no-instructions

mv postgresql.auto.conf data
mv pg_hba.conf data

pg_ctl start
createuser fine
createdb fine --owner fine
pg_ctl stop -m fast

# remove this script self
rm initdb.sh
