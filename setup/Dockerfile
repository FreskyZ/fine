
# build: docker build --target certbot --tag my/certbot:1 .
# setup dev environment: mkdir testconfig testdata testlog testrun && cp ../real-config.json testconfig/config.json
# test shell: docker run -it --rm --name certbot1 -v ./testrun:/run/fine -v ./testconfig:/etc/fine -v ./testdata:/etc/letsencrypt -v ./testlog:/var/log/letsencrypt --entrypoint /bin/sh my/certbot:1
# test setup: docker run -it --rm --name certbot1 -v ./testrun:/run/fine -v ./testconfig:/etc/fine -v ./testdata:/etc/letsencrypt -v ./testlog:/var/log/letsencrypt my/certbot:1 --setup
# test renew: docker run -d --name certbot1 -v ./testrun:/run/fine -v ./testconfig:/etc/fine -v ./testdata:/etc/letsencrypt -v ./testlog:/var/log/letsencrypt my/certbot:1
# update auth hook: docker cp certbot-auth-hook.py certbot1:/auth.py
# update setup script: docker cp certbot-entrypoint.py certbot1:/setup.py
# update schedule script: docker cp certbot-entrypoint.py certbot1:/schedule.py
# update deploy hook: docker cp certbot-deploy-hook.py certbot1:/etc/letsencrypt/renewal-hooks/deploy/deploy.py
FROM certbot/certbot:v5.4.0 AS certbot

# the evil pip install to global by default, which is convenient for this case
RUN pip install dnspython

# no need to put this in /etc/letsencrypt, this file is now tracked here
COPY --chmod=700 certbot-auth-hook.py /auth.py
COPY --chmod=700 certbot-entrypoint.py /entrypoint.py
# no, the /etc/letsencrypt path will be masked by volume,
# you need to put in root and move to that location later, see check_deploy_hook in entrypoint.py
# COPY --chmod=700 certbot-deploy-hook.py /etc/letsencrypt/renewal-hooks/deploy/deploy.py
COPY --chmod=700 certbot-deploy-hook.py /deploy.py

WORKDIR /
ENTRYPOINT ["/entrypoint.py"]
