#!/bin/bash

case "$1" in
    acme-shell)
        echo docker compose run --rm --name acme-shell1 -e "PS1=[@ACME-SHELL:\w]\n\$ " --entrypoint sh acme
        exec docker compose run --rm --name acme-shell1 -e "PS1=[@ACME-SHELL:\w]\n\$ " --entrypoint sh acme
    ;;
    psql)
        echo docker compose run --rm --name database-shell1 --entrypoint "psql fine fine" database
        exec docker compose run --rm --name database-shell1 --entrypoint "psql fine fine" database
    ;;
    postgres-shell)
        echo docker compose run --rm --name database-shell1 -e "PS1=[@PG-SHELL:\w]\n\$ " --entrypoint sh database
        exec docker compose run --rm --name database-shell1 -e "PS1=[@PG-SHELL:\w]\n\$ " --entrypoint sh database
    ;;
    akari)
        echo docker compose run --rm --name akari1 -p 8001:8001 -v .:/self akari
        exec docker compose run --rm --name akari1 -p 8001:8001 -v .:/self akari
    ;;
    akari-shell)
        echo docker compose run --rm --name akari2 -v .:/self --entrypoint sh akari
        exec docker compose run --rm --name akari2 -v .:/self --entrypoint sh akari
    ;;
    *)
        echo "USAGE: $0 acme-shell | psql | postgres-shell | akari | akari-shell"
        exit 1
    ;;
esac
