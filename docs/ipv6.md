# IPv6

by the way, even in my home network have a good ipv6 support at this time, comparing to the status a few years ago

for now no specific topics here, cloud service provider configuration is out of scope of this document, docker setup see container.md

- check cloud service provider configured ip address by `ip -6 addr`
- check current ssh connection source ip by `echo $SSH_CLIENT`
- run simple socket or http server to see source ip, e.g. `nc -l -6 -p 8001 -v`
- ping from other machine with `ping -6`, curl from other machine with `curl -6`
- try check ipv6 status from convenient online service like https://ready.chair6.net
- in this program, refresh https://id.example.com to see last access ip address

TODO cloudflare proxied dns record can redirect ipv4 to ipv6, so that you can use ipv6 single stack in cloud server,
note that generally only work for 80 and 443, to connect ssh and akari from ipv4 machine, you need something like non proxied subdomain, ssh.example.com, etc.
