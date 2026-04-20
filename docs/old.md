# The Old Hard Days

this was a document which summaries changes in this project in 2025,
mainly focus on major improvements, and conceptural and directional changes,
now I'd like to repurpose the document to focus on "the old hard days",
to inform readers don't forget the old difficulties and traditional hard working life style

in 2025, nearly every line of source code and every line of the documets are updated, include

- ECMA module import syntax widely accepted, makes mypack bundler module resolution part easier
- introduce of 'node:' url helps distinguish nodejs builtin packages and 3rd party libraries or relative modules
- my experience? and AI experience? let me design a bundler without function wrapper for each module
- my experience? of reading minified source code? let me discard the use of source map?
- react jsx runtime become formal and don't need manual handling
- node directly executing typescript files avoid the need of build script bootstrapping
- new remote akari communication protocol design simplifies build script architecture
- use of Let's Encrypt DNS-01 and split of certificates make certificate process more robust, use of wildcard certificate?
- use non-root user for server process make things more security?
- implementation of short link service make url sharing a lot more easier
- my experience? of OAuth2.0 and OIDC let me design a new SSO authentication schema

in 2026, nearly every process and worflow outside script folder and src folder is updated, include

- migrate to debian, avoid dangerous ubuntu 26 rust migration
- new cloud server setup process nearly fully automated
- migrate certificate automation process to container, avoid snap
- use wildcard certificate, avoid subdomain related certificate operations
- migrate to use postgresql, a real relational database comparing to mysql
- migrate core module to container, avoid socket activation operations
- migrate config file to yaml, finally allow comments, split into multiple files
- setup real automatic backup and restore process
