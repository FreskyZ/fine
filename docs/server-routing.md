# Server Routing

There are multiple sites hosted on this service, they have different domains, subdomains or (theoritically) subpaths.
This document *was* used to describe precisely how each request is responded, but they are too complex and prune to change,
so they are now in configuration, making this document and content handling in core module simpler.

## Design Principles

- public files are available in all domains'/subdomains' root path
- apis are available at one `api.domain.com` with authentication
- only api invocation can handle non-GET requests
- only api invocation returns status 404 for unknown api, others temporary redirect to 404 page
