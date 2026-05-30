set -ex

# TODO it is not good if I add other databases not used by this codebase, think about this later

pg_dump -U fine -f /var/lib/pgsql/backup/fine.sql fine
