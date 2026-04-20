# Multiple Application Structure

this project starts as a simple website hosting serveral applications of my interest, with the
initial motivation to learn internals of frontend engineering by implementing related libraries and
programs on my own, then over the years and over the gaps between the development of this project
halt and restart again (it's more than 8 years at the time of writing since the first line of code
in this project, if you ask), applications of my interest drifts from here to there, add new, take
down and development of applications disrupt the using and running of existing applications

so the hot reloading concept is adopted and change the remaining core module to something more like
a reverse proxy program, handling common functionalities like application static files and access
control, which still matches the motivation because reverse proxies are very close to front end

currently there are 2 communication schemes, one by hot reloading nodejs module, by adding a query
parameters in the module uri, which is simple and fast, but loading a new module does not actually
remove old module from module cache, cause memory leaks and potential conflicts, one by unix domain
socket, allowing a multiprocess architecture, which is complex but provides more isolation

### New Application Process

1. new folder in small project
2. copy package.json from here or existing app, npm i
3. add file structure src/server, src/client, src/shared
4. copy akari.ts from here or existing app, setup components and adk, run make-akari
5. write shapes.xml database types, prepare server index.ts and code generate
6. write shapes.xml actions and types, prepare client index.tsx and code generate
7. create folder static/appname
8. configure content.yml and access.yml this application
9. try deploy and use the application!

or even smaller application

1. new folder in small project
2. hand written index.html and hand written inline javascript or single index.js file,
   copy from client-startup function to make authentication work
3. hand written server index.js, copy server-helper classes
4. configure content.yml and access.yml for this application
5. try deploy and use the application

these lists are incomplete and inaccurate because there is no active applications
at the time of writing TODO improve the section to make new applications more smooth

### Code Generation

have a good section in build-script.md, see that

the code generation process motivates my production work a lot, which grows into a really
large and powerful toolset saving a lot of work times to let me think and work on more
improvements of efficiency in my production work, which in turn provides more time and help
me improve the code generation tool here in this project, recusively

### Application Development Kit

abbreviated adk, for common functionalities of application servers that cannot directly
handled in core module but need them to invoke, like the old database functions helper
(which have long gone at the time of writing because postgresql don't need that!)
and for now the client side authentication process and the server side communication part

to deploy these files into application, the old build script use a...symlink to avoid
desynchronization of these files, which is very inconvenient to setup and development
inside the core module and application servers disrupt each other, the today build script
use a...bundle file contents inside the build script and later extract them to application
server development location approach, which works good actually, really

### Unix Domain Socket

unix domain socket is a tcp-like full duplex continuous byte stream channel,
this means you cannot reuse a connection to send multiple requests to application server at
the same time, so you need a connection pool, there was a connection pool implemented in the
project, which have not run for very long time, and the code is hard to understand and seems
not that reliable, TODO update the unix domain socket connection pool and talk about here

### TODO?

currently all communications of application servers are json,
it was designed to add non json features but not very motivated so they are still here as todo?

- file download and upload, by the way, file download likely should use external content instead
- websocket api
- streaming response, this is motivated by llm ai, which is kind of new
- and then, if application interface need these many features,
  do application servers need to report to core module the special actions, in a structured way?
