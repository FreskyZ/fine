# Maintainence

I mean, although this project is personal and small and some topics do not apply or is not important,
you still need to follow some process occassionally or routinely to keep the service effectively alive

for now this document only contain this list but some items may grow into sections in future?

- need human to check cloud server status
  - uptime, resource usage, etc.
  - lifetime (pay money part)
- need human to check containers status
  - up status, resource usage, etc.
- need human to check domain status (pay money part)
- need human to check ssl certificates status, see also certification.md
  - need human to check dns api key lifetime and rotation
- need human to check dependencies version and security issues include
  - host kernel, host apt packages, base images, container apk packages, node modules, python packages
- need human to review logs to check abnormal issues, see also certification.md, database.md
  - (should not need human) rotate logs
- need human to check backup status, see also container.md
  - check backup files status in object storage
  - check backup files on local machine by manually run the sync script?
  - check object storage service status (pay money part)
  - check oss api key lifetime and rotation
  - test run restore process?
- (should not need human) database optimize (full vaccume, etc.), see also database.md
