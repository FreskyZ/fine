#!/usr/local/bin/python -u
#                  NOTE ^^ this -u is for unbufferred output, which is required if you want to docker logs python entrypoint print output
import os, sys, subprocess, random, time, signal, datetime, pathlib, shutil

# certbot container entrypoint, renew certificates with randomized schedule

def check_deploy_hook(scriptname):
    deploy_dir_path = pathlib.Path('/etc/letsencrypt/renewal-hooks/deploy')
    if not deploy_dir_path.exists():
        print(f'{scriptname}: missing renewal-hooks/deploy folder, you may need to check volume mapping or setup result')
        exit(1)
    deploy_script_path = deploy_dir_path / 'deploy.py'
    if not deploy_script_path.exists():
        print(f'{scriptname}: deploy deploy hook')
        shutil.move('/deploy.py', deploy_script_path)

DATETIME_FORMAT = '%Y-%m-%d %H:%M:%S'
def schedule(savedir, action):
    # implement same timer as certbot snap setup 00:00~24:00/2,
    # which is twice a day at random time, one between 00:00-12:00, one between 12:00-24:00
    # all time here use utc

    # hours in one timespan, the expected behavior is 12hours, change to 1 hours for test purpose
    SPAN_SIZE = 12

    sleeping = False
    shutdown_requested = False
    def request_shutdown(s, f):
        if sleeping:
            print('schedule.py: interrupting sleep...')
            raise SystemExit(0)
        else:
            print('schedule.py: requesting shutdown...')
            shutdown_requested = True
    signal.signal(signal.SIGINT, request_shutdown)
    signal.signal(signal.SIGTERM, request_shutdown)

    startup_time = datetime.datetime.now(datetime.UTC)
    print(f'schedule.py: start at {startup_time.strftime(DATETIME_FORMAT)}')

    def load_saved_time(name: str) -> datetime.datetime:
        path = savedir / name
        if path.exists():
            try:
                with open(path) as f:
                    return datetime.datetime.strptime(f.read(), DATETIME_FORMAT).replace(tzinfo=datetime.UTC)
            except Exception as ex:
                # if read or parse error happens, regard as file not exist
                print(f'schedule.py: failed to load {name} time from file?', ex)
        return None

    saved_next_time = load_saved_time('next')
    if saved_next_time:
        print(f'schedule.py: read saved next time {saved_next_time.strftime(DATETIME_FORMAT)}')
    # timespan is represented as beginning of the timespan
    startup_timespan = datetime.datetime.combine(startup_time.date(), datetime.time(hour=startup_time.hour // SPAN_SIZE * SPAN_SIZE), tzinfo=datetime.UTC)

    # if saved next time is within startup span or startup next span, it is regarded as valid
    if saved_next_time and startup_timespan < saved_next_time < startup_timespan + datetime.timedelta(hours=SPAN_SIZE * 2):
        next_time = saved_next_time
        print(f'schedule.py: use saved next time {saved_next_time.strftime(DATETIME_FORMAT)}')
    else:
        prev_time = load_saved_time('prev')
        if prev_time:
            print(f'schedule.py: read prev time {prev_time.strftime(DATETIME_FORMAT)}')
        # if no prev time, assign previous timespan to prev_timespan
        prev_timespan = datetime.datetime.combine(prev_time.date(), datetime.time(hour=prev_time.hour // SPAN_SIZE * SPAN_SIZE), tzinfo=datetime.UTC) if prev_time else startup_timespan - datetime.timedelta(hours=12)
        # timespan end is same as next timespan, but next_timespan looks like timespan for next time, which may not be correct, so call _end
        startup_timespan_end = startup_timespan + datetime.timedelta(hours=SPAN_SIZE)
        # if prev time is within startup timespan or startup timespan is near end, schedule next time to next timespan
        if startup_timespan == prev_timespan or (startup_timespan_end - startup_time).total_seconds() < 3600:
            next_time = startup_timespan_end + datetime.timedelta(seconds=random.uniform(0, SPAN_SIZE * 3600))
        else: # else schedule to startup timespan
            next_time = startup_time + datetime.timedelta(seconds=random.uniform(300, (startup_timespan_end - startup_time).total_seconds()))

        with open(savedir / 'next', 'w') as f:
            f.write(next_time.strftime(DATETIME_FORMAT))
        print(f'schedule.py: schedule next time {next_time.strftime(DATETIME_FORMAT)}')

    while True:
        if shutdown_requested:
            print('schedule.py: shutdown requested, exit')
            exit()

        now = datetime.datetime.now(datetime.UTC)
        remaining_seconds = (next_time - now).total_seconds()
        if remaining_seconds > 60: # regard less than 1 minute as hit
            try:
                sleeping = True
                time.sleep(min(remaining_seconds, 3600)) # max sleep 1 hour, then go to next loop
            except SystemExit:
                print('schedule.py: shutdown requested in sleep, exit')
                exit(0)
            finally:
                sleeping = False
        else: # less than 1 minute or is pass due
            action(now)
            with open(savedir / 'prev', 'w') as f:
                f.write(now.strftime(DATETIME_FORMAT))
            current_timespan = datetime.datetime.combine(now.date(), datetime.time(now.hour // SPAN_SIZE * SPAN_SIZE), tzinfo=datetime.UTC)
            next_timespan = current_timespan + datetime.timedelta(hours=SPAN_SIZE)
            next_time = next_timespan + datetime.timedelta(seconds=random.uniform(0, SPAN_SIZE * 3600))
            with open(savedir / 'next', 'w') as f:
                f.write(next_time.strftime(DATETIME_FORMAT))
            print(f'schedule.py: schedule next time {next_time.strftime(DATETIME_FORMAT)}')

def run_renew_command(time):
    print(f"schedule.py: renew at {time.strftime(DATETIME_FORMAT)}")
    # print('================================')
    # print('pretending run certbot renew -q!')
    # print('================================')
    child = subprocess.run(["certbot", "renew", '-q'], check=False)
    print(f"schedule.py: renew command complete with return code {child.returncode}")

check_deploy_hook('schedule.py')
savedir = pathlib.Path('/etc/letsencrypt/renewal-schedule')
if not savedir.exists():
    savedir.mkdir()
schedule(savedir, run_renew_command)
