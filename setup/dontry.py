import ipaddress, datetime, json, os, sys, subprocess, tarfile, pathlib

# sync nft rules with logs, also see src/core/dontry.ts
# works for rootless docker and network host which manage rules in system level table,
# works for normal network that rules should insert into iptables-nft DOCKER-USER chain,
# don't know how to work with --firewall-backend nftables? because that's not documented?

# iptables don't have a stable api and need to parse text output,
# so this script always use nft commands assume iptables are iptables-nft,
# so this does not work with real legacy iptables (xtables),
# docker say don't use nft to manipulate iptables rules but that seems ok?

# nftables: https://netfilter.org/projects/nftables/index.html
#      man: https://netfilter.org/projects/nftables/manpage.html
# cheatsheet:
# - list rules: sudo nft list chain ip filter DOCKER-USER
# - create set: sudo nft add set ip filter blocked_ips \{ type ipv4_addr\; flags interval\; \}
#   can have same name in different family: sudo nft add set ip6 filter blocked_ips \{ type ipv6_addr\; flags interval\; \}
# - display set: sudo nft list set ip filter blocked_ips
#   json output: sudo nft --json list set ip filter blocked_ips
# - add elements: sudo nft add element ip filter blocked_ips \{ 195.179.11.0/24, 45.148.10.0/24 \}
#   delete elements: sudo nft delete element ip filter blocked_ips \{ 195.179.11.0/24, 45.148.10.0/24 \}
# - use set: sudo nft add rule ip filter DOCKER-USER ip saddr @blocked_ips tcp dport \{ 80, 443 \} counter drop
#   this will display a source address 0.0.0.0 in iptables-nft output, but ok in nft
# - delete set: sudo nft delete set ip filter blocked_ips, cannot delete when used in rule

# return list of one of IPv4Address, IPv4Network, IPv6Address, IPv6Network
def collect_from(rawlog):
    logrecords = [] # (address, network, time)
    for row in rawlog.splitlines():
        splitted = row.split(' ')
        if len(splitted) <= 1:
            print(f'dontry.py: log record {row} unexpected format?')
            continue
        # the z part is literal when write into log, but you can parse it as timezone
        time = datetime.datetime.strptime(splitted[0], '%Y%m%dT%H%M%S%z')
        try:
            address = ipaddress.ip_address(splitted[1])
        except ValueError as ex:
            print(f'dontry.py: log record {row} parse ip address fail?', ex)
            continue
        network = ipaddress.ip_network(int(address))
        if isinstance(address, ipaddress.IPv4Address):
            network = network.supernet(prefixlen_diff=8)
        elif address.ipv4_mapped is None:
            network = network.supernet(new_prefix=64)
        else:
            # add both records for ipv4 mapped ipv6 records
            mapped_address = address.ipv4_mapped
            mapped_network = ipaddress.ip_network(int(mapped_address))
            mapped_network = mapped_network.supernet(prefixlen_diff=8)
            logrecords.append((mapped_address, mapped_network, time))
            # print(f'log {time} {mapped_address} ({mapped_network})')
            network = network.supernet(prefixlen_diff=8)
        logrecords.append((address, network, time))
    # print('\n'.join([str(r) for r in logrecords]))

    elements = []
    # multiple occurance of ip from same subnet regardless of any time, ban subnet permanently
    all_networks = set()
    for address, network, time in logrecords:
        if network in all_networks:
            elements.append(network)
        all_networks.add(network)
    # single occurance of ip, ban this day
    now = datetime.datetime.now(tz=datetime.UTC)
    for address, network, time in logrecords:
        if network not in elements and (now - time).total_seconds() < 86400:
            elements.append(address)
    # TODO need to clear outdated entries?
    # print('\n'.join([str(r) for r in elements]))
    return elements

# read set elements, return list of one of IPv4Address, IPv4Network, IPv6Address, IPv6Network
def readset(family, table, setname):
    process = subprocess.run(['nft', '--json', 'list', 'set', family, table, setname], capture_output=True, text=True)
    if process.returncode:
        print(f'dontry.py: unexpected return code from nft list-set {process.returncode}?')
        print('stdout', process.stdout)
        print('stderr', process.stderr)
        exit(1) # nft list set fails, should not continue to run more nft commands
    try:
        result = json.loads(process.stdout)
    except Error as ex:
        print(f'failed to parse result json?', process.stdout, process.stderr, ex)
    if 'nftables' not in result:
        print('dontry.py: unexpected result structure? .nftables', result)
        exit(1)
    if not isinstance(result['nftables'], list) or len(result['nftables']) < 2:
        print('dontry.py: unexpected result structure? .nftables.1', result)
        exit(1)
    if 'set' not in result['nftables'][1]:
        print('dontry.py: unexpected result structure? .nftables.1.set', result)
        exit(1)
    nftset = result['nftables'][1]['set']
    if nftset['family'] != family:
        print(f'dontry.py: unexpected result structure? .nftables.1.set.family != {family}', result)
        exit(1)
    if nftset['table'] != table:
        print(f'dontry.py: unexpected result structure? .nftables.1.set.table != {table}', result)
        exit(1)
    if nftset['name'] != setname:
        print(f'dontry.py: unexpected result structure? .nftables.1.set.name != {setname}', result)
        exit(1)

    elements = []
    # elem property may not exist in json if no elements
    if 'elem' not in nftset:
        print(f'dontry.py: nft list-set family={family} table={table} set={setname} return empty result')
    else:
        print(f'dontry.py: nft list-set family={family} table={table} set={setname} return {len(nftset['elem'])} elements')
        for element in nftset['elem']:
            if isinstance(element, str):
                elements.append(ipaddress.ip_address(element))
            else:
                elements.append(ipaddress.ip_network(f'{element["prefix"]["addr"]}/{element["prefix"]["len"]}'))
    return elements

# extract dontry.log from logs backup file
logs_archive_filepath = next((p for p in pathlib.Path('./backup').iterdir() if p.name.startswith('fine-logs-')), None)
if logs_archive_filepath is None:
    print('dontry.py: not found ./backup/fine-logs-*, check backup status')
    exit(1)
with tarfile.open(logs_archive_filepath, 'r:xz') as f:
    with f.extractfile('data/logs/fine/dontry.log') as r:
        if r is None:
            print(f'dontry.py: not found dontry.log in {logs_archive_filepath}, skip')
            exit(0)
        rawlog = r.read().decode()
expect_elements = collect_from(rawlog)

# setup:
# sudo nft add set ip filter blocked_ips \{ type ipv4_addr\; flags interval\; \}
# sudo nft add rule ip filter DOCKER-USER ip saddr @blocked_ips tcp dport \{ 80, 443 \} counter drop
# sudo nft add set ip6 filter blocked_ips \{ type ipv6_addr\; flags interval\; \}
# sudo nft add rule ip6 filter DOCKER-USER ip6 saddr @blocked_ips tcp dport \{ 80, 443 \} counter drop
if 'iptables' in sys.argv:
    actual_elements = readset('ip', 'filter', 'blocked_ips') + readset('ip6', 'filter', 'blocked_ips')
    command_count = 0
    for element in [e for e in actual_elements if e not in expect_elements]:
        command_count += 1
        # use multiple nft command with single address to make log clear
        family = 'ip' if isinstance(element, (ipaddress.IPv4Address, ipaddress.IPv4Network)) else 'ip6'
        returncode = os.system(' '.join(['nft', 'delete', 'element', family, 'filter', 'blocked_ips', '{', str(element), '}']))
        print(f'dontry.py: nft delete-element family={family} table=filter set=blocked_ips element={element} return {returncode}')
    for element in [e for e in expect_elements if e not in actual_elements]:
        command_count += 1
        family = 'ip' if isinstance(element, (ipaddress.IPv4Address, ipaddress.IPv4Network)) else 'ip6'
        returncode = os.system(' '.join(['nft', 'add', 'element', family, 'filter', 'blocked_ips', '{', str(element), '}']))
        print(f'dontry.py: nft add-element family={family} table=filter set=blocked_ips element={element} return {returncode}')
    if not command_count:
        print(f'dontry.py: up to date')

# setup:
# sudo nft add table inet filter
# sudo nft add chain inet filter input \{ type filter hook input priority filter\; \}
# sudo nft add set inet filter blocked_ips \{ type ipv4_addr\; flags interval\; \}
# sudo nft add set inet filter blocked_6ips \{ type ipv6_addr\; flags interval\; \}
# sudo nft add rule inet filter input ip saddr @blocked_ips tcp dport \{ 80, 443 \} counter drop
# sudo nft add rule inet filter input ip6 saddr @blocked_6ips tcp dport \{ 80, 443 \} counter drop
elif 'system' in sys.argv:
    actual_elements = readset('inet', 'filter', 'blocked_ips') + readset('inet', 'filter', 'blocked_6ips')
    command_count = 0
    for element in [e for e in actual_elements if e not in expect_elements]:
        command_count += 1
        # use multiple nft command with single address to make log clear
        setname = 'blocked_ips' if isinstance(element, (ipaddress.IPv4Address, ipaddress.IPv4Network)) else 'blocked_6ips'
        returncode = os.system(' '.join(['nft', 'delete', 'element', 'inet', 'filter', setname, '{', str(element), '}']))
        print(f'dontry.py: nft delete-element family=inet table=filter set={setname} element={element} return {returncode}')
    for element in [e for e in expect_elements if e not in actual_elements]:
        command_count += 1
        setname = 'blocked_ips' if isinstance(element, (ipaddress.IPv4Address, ipaddress.IPv4Network)) else 'blocked_6ips'
        returncode = os.system(' '.join(['nft', 'add', 'element', 'inet', 'filter', setname, '{', str(element), '}']))
        print(f'dontry.py: nft add-element family=inet table=filter set={setname} element={element} return {returncode}')
    if not command_count:
        print(f'dontry.py: up to date')

else:
    print('USAGE: dontry.py iptables | system')
