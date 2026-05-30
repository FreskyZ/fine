set -ex

initdb --locale-provider=icu --locale=en_US.utf8 --no-instructions

mv postgresql.auto.conf data
mv pg_hba.conf data

pg_ctl start
createuser fine
createdb fine --owner fine

for file in backup/*.sql; do
    psql -U fine -f $file
done

pg_ctl stop -m fast
# remove this script self
rm setup.sh
