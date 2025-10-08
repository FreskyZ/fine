# Build Script

A core topic of this project is the unified build script. The build script

- transpile typescript
- lint source code
- bundle multiple source file programs
- code generation for database model and web api model
- deploy
- hot reload static content and application servers
- other development lifecycle functionalities

> The build script executable file name is `akari`, あっかりんーー

### Motivation

The unified build script design was motivated by the complexity and redundancy of configuration files commonly found
in web application codebases, such as `tsconfig.json`, `babelrc`, `eslintrc` and `webpack.config.js`. These files make
the project structure horrific and hard to understand and maintain.

In monorepo setups, this challenge is amplified. While some tools support shared configurations accross projects,
others require duplicating files, leading to potential desynchronization or accidental synchronization. Additionally,
some tools use hierarchical configuration systems and make it difficult to determine the actual settings applied to
specific files. And then the `webpack` further complicate matters with extensive and fragmented configuration
requirements, involving many third-party plugins. This complexity necessitates frequent relearning from various
tutorials, guidelines, blogs and document sources before the LLM AI era, especially during architectural changes.

To simplify this process, this build script avoids the need for separate configuration files by inverse of control,
instead of providing configuration files for tools to read, this build script leveraging the nodejs APIs of these
tools. And configuration details are embedded directly within the build script source code, streamlining maintenance
and reducing cognitive overhead.

This approach affects some other design decisions and will be called "AC rule" (anti-configuration) in the following
sections in the document.

This approach is not fully compatible with multi-developer projects in open-source communities or commercial companies.
The absence of a standalone TypeScript configuration file forces vscode to rely on its "implicit project configuration"
mechanism. This mechanism lacks essential settings for real-time issue detection in the editor and includes unnecessary
settings that may highlight false positives. This reduces development efficiency, especially when developers have
varying levels of expertise and habits. Some of these issues are mitigated by vscode new setting features and can be
found in the `.vscode/settings.json` file, which allows customization of the implicit configuration.

For lint tools, real-time issue detection can be disruptive for work-in-progress code, often producing false positives.
Based on actual experience, this limitation can improve efficiency by reducing unnecessary distractions during
development.

The use of nodejs api also enables unique features compared to traditional configuration approaches. By keeping all
intermediate states and files in memory, this project eliminates the need to design file structures for intermediate
files across different steps or stages of various build targets. Additionally, final build artifacts are deployed
immediately, removing the need for temporary storage locations.

This principle is cool and affects some other design decisions and will be called "NI rule" in this document.

### The Make App Easier Movement

The major development on this project has restarted in this year (I believe I will not tweak the document which ruin
the git blame result so will keep the "this year" term). This project was stuck at a refactoring process on this build
script which then stuck the development process of other applications. Despite this mysterious stuck chain, there are
many other issues in the old application development process, so this time I'd like to address all of the known issues
and make developing applications and add new applications easy and smooth.

This movement affects some design decisions and will be called "AE movement" in the document.

### Bootstrapping

The build script is organized in multiple nodejs typescript files. In *old days*, these files required transpilation
into javascript for execution. To avoid placing a javascript file beside each typescript file or need a separate
directory to put the javascript files, the transpile result is bundled into one javascript executable, this operation
is done by the build script itself, which is bootstrapping. An initial bootstrapping shell script was provided to
compile the early version of the source files into an initial executable file. This executable file would then build
newer version of the source files, replacing itself after each update.

However, the bootstrapping process introduced significant challenges then anticipated. For example, a runtime bug in
critical execution path could pass transpile but render the executable non-functional. The design of restart
bootstrapping from early versions of the source files actually never works. Additionally, since the build script is
used in application repositories, it requires duplicating full bootstrapping capabilities, adding further complexity
and suffers from same pitfalls.

Then nodejs supports directly executing typescript, which casually invalidates the need of bootstrapping.

> nodejs typescript support is added at https://github.com/nodejs/node/releases/tag/v22.6.0.
> To make things better, the experimental warning is removed several days before the AE movement
> https://github.com/nodejs/node/pull/58643

The build script no longer needs to build itself, and becomes different from normal build targets. The target file is a
typescript script, whereas normal build targets produce javascript. The input source files function like a library, but
the target file includes additional manually written sections to make it an executable script. Normal build targets
either produce a library from library source code or an executable from executable source code. To handle this, a
dedicated script, `make-akari.ts`, is implemented to build the build script. This script, referred to as the make
script in this document, is specifically designed to process and generate the `akari.ts` files.

The make script first performs type checking on the build script source files using slightly modified compiler options
compared to normal targets. This process skips javascript emission to improve clarity and speed. Currently, the
`erasableSyntaxOnly` compiler option is enabled because node does not yet support non-strippable TypeScript syntax,
such as enums and class constructor parameters as class properties. This limitation is expected to be resolved in
future nodejs releases.

Next, the make script lints the build script source files and also lints and type-checks itself to prevent potential
errors. Since this is a read-only operation on the make script's source code, it avoids the bootstrap issues present
in the original design.

The make script processes the build script source files by traversing their TypeScript AST. It collects import
declarations, ensures external reference consistency (e.g., consistent default and namespace import names for the same
package), gathers all named imports, and analyzes relative import relationships. After organizing the components, it
combines the source file contents and inserts them into the target file's partial generation section, between the
`// BEGIN LIBRARY` and `// END LIBRARY` markers.

This approach makes the resulting build script highly readable and nearly standalone, except for its npm dependencies.
However, it is prone to accidental modifications since navigating to a definition only leads to the build script file
instead of the original source files in the `script` folder. These changes are naturally overwritten by the make
script, causing the loss of edits. To address this, a hash of the auto-generated section's content is added to the
marker, like `// END LIBRARY 123abcdef`. If the content between the markers has a mismatched hash, a warning is
displayed, and the make script aborts make process.

The local and remote parts of the build script need to share message type definitions, but both are typescript modules
requiring type definitions in their respective target files. Using a `.d.ts` file alongside these modules violates the
AC rule. Instead, a similar partial generation technique is employed: type definitions are manually copied into the
local part source file and wrapped with `// BEGIN SHARED TYPE name` and `// END SHARED TYPE name` markers. During
validation, the content is compared with the original definition in the remote part. This feature is also used to share
admin interface command type definitions between the build script and the core module.

> TODO validate packages in the script and install them if need.

> The remaining part of this section are stories and is not important.

I spent several days for this section, because I cannot explain clearly why the requirements and constraints leads to
this design, why is copy source code around a good idea? But that's not the actual thinking process, I first
implemented the new bundle approach, the partial code generation mechanism and the generated content hash experience,
then think up of this design as a whole because it is cool. I tried to reject AI recommendations to make the decision
looks reasonable. AI says I can publish the package, publish the package to private registry, use `npm link` to link
packages in development time, or use npm local file dependency
https://docs.npmjs.com/cli/v11/configuring-npm/package-json#local-paths
(this feature is new to me), I rejected that this script is not a package, this is true, because this script is too
dedicated to be a common package. AI also recommends relative path import, although marked with hacky, this is easy to
reject because it relies on local file structure and adds step to project setup. AI also suggestes symbolic link, which
is actually used in the old design, but based on my current experience, the shell script to make symbolic links is too
hard to understand and too not structural, which is even actually worse than the relative import approach. And then the
remaining option, copy source code around still does not seem reasonable...so I give up and directly explain what
happens instead of find a reason.

Quote old rejection because I forget I wrote this and now this section is called complete I'm lazy to integrate them.

- it is not suitable to submodule app projects in this project, because it is really strange
  to include apps in a reverse proxy project, I did not split them to include them together again
- it is not suitable to submodule this project in app projects, because this project contains
  some other things not used in app, like core module and akari (server) source code
- it is not very suitable to split shared files into another repository, because
  at first, app repos need script/tools, and they need admin command declarations, while some
  of admin interface implementation is in akari (server), it should also include akari (server),
  move the complete script part into separate repo makes this repo kind of empty (only core module
  and static pages) while actually static content implementation, admin interface implementation is
  tightly coupled with logics in build script, so split repo approach is also not good

There was several standalone javascript scripts for each target in early days of this AE movement, because at that time
the old build script completely stuck on its bootstrap cycle and cannot work, so I'd like to start rebuild the core
module first, and developped a `build-core.js` script (I'm not aware the type stripping feature of nodejs at that
time), initially implemented the new bundler that does not wrap contents in a function, try AI to implement the import
declaration parser and finally implemented a complete version on my own. After the core module works, I need to invoke
admin interface commands to reload the user page to implement and test for the new authentication feature, the original
local-remote communication is...very strange, and is stuck in the old build script and cannot be easily recovered, if
you are interested in the old version, you can even find a core host feature that host the core module as a subprocess
and directly send command to it or receive output from stdout. So I implemented a `command-center.js` and try new
approaches that allow this script to be interactive and only send human triggerred commands from remote to local to in
theory keep the original security principle that admin interface cannot be easily invoked from external commands, this
local scripts `build-core.js` and `build-user.js` are made non interactive and that proved inconvenient so lead to the
current double interactive script design. And with several runnable `build*.js` implementations, and learn from old
component split pattern, the current `script/components` project structure is implemented as current design.

### Local-Remote Architecture

First, the core server process requires an admin interface for hot reloading and controlling switches. Instead of
exposing a GUI interface on the web, which increases the attack surface, a Unix domain socket interface is exposed
locally on the server. To integrate this interface into the build script's deployment process, a dedicated script is
implemented. This script runs on the server to receive messages from the local build script, send messages to the
server process, and handle other tasks. This script is called `remote-akari.ts`, it is referred to as the "remote part"
in this document, and the other is local part, the remote part is previously called "akari (server)" in this document.

The remote part sets up a WebSocket server to handle connections from the local part. Once a WebSocket connection
is established and authenticated, the remote part listens for messages. After the local part completes validation,
transpilation, and bundling, it sends the resulting file through the WebSocket connection. The remote part writes the
file to the deployment location and forwards a hot reload command from the local part to the server process's admin
interface. The response from the server process is then relayed back to the local part.

Additionally, the remote part manages another WebSocket protocol for web pages served by the server process or
individual applications. The local part can send browser reload commands, which the remote part forwards to the browser
to trigger a page reload. The small code snippet runs on browser that connects to this websocket server is also served
in the http server of the websocket server. This mechanism is similar to how `webpack-dev-server` handles live reload
of web pages.

> By the way, there is a `reload-css` command in old browser communication mechanism to only reload css file,
> but now I do not have separate css file so this command is not supported, RIP `reload-css`

> The following part are stories and is not important.

For reference, the old implementation before the AE movement was vastly different. The akari (server) would first start
an HTTP server and generate a random key and initialization vector for symmetric encryption. The local build part would
then retrieve these encryption parameters via SFTP download. When the local part needed to send a message, it would
encrypt the message in the HTTP request and handle the response precisely based on the message type. For instance, it
would pipe `systemctl` command output to stdout, as the akari (server) is a service and not designed to display
arbitrary information in real time. One of the most facinating aspects of the original design was its ability to host
the core server process and pipe its output through the akari (server), over an HTTP connection, and display it on the
local part. While undeniably cool, this design made communication handling overly complex and unstable. It also
employed unconventional methods for security — on one hand, "strange" methods should not be relied upon for security;
on the other hand, this design was secure because my SSH identity is secure, preventing unauthorized users from
sending valid messages to the akari (server), even if they read and understandd the source code.

During the early stages of the AE movement, a temporary implementation was introduced. The server-side executable was
named `command-center.js`, and it became known as the "command center" in subsequent discussions. This implementation
was born out of frustration with the cumbersome workflow: I had to manually switch between the local shell to input
build commands and the server-side shell to execute a small script for sending admin commands to trigger hot reloads,
even for minor application source code changes. To streamline this process and maintain development momentum, I
quickly implemented a new local-remote communication system.

The command center started a WebSocket server, which the local part would connect to. Since WebSocket does not support
authentication headers, I devised a human-in-the-loop authentication scheme. The command center would generate a token,
display it on the remote side, and require me to manually copy and input the token into the local part. Once
authenticated, no additional connections were allowed. In this design, only the remote command center was interactive,
requiring me to input commands there, while the local part passively listened for remote messages and initiated the
local build process. To adhere to the original strict limits on the remote part's receiving side, the local part was
restricted to sending only a simple ok flag to indicate whether to proceed. To simplify the authentication process, the
WebSocket server would stop responding to further messages after authentication. Instead, the local part used an HTTPS
endpoint to send its status report. However, this design introduced significant complexity and stability issues.
Real-world usage revealed that the two local-initiated operations—SFTP file uploads and HTTPS POST requests—were
painfully slow. Each operation often took 2–3 seconds, and occasionally over 10 seconds, partially due to the overhead
of initiating new TLS connections.

Ultimately, I designed and implemented a fully WebSocket-based solution. This new design is blazingly fast, enabling
seamless file transfers and admin command execution. It has proven to be far more efficient and stable than its
predecessors, marking a significant improvement in the development workflow.

### File System Watch

File system watching was implemented in the old version, it is not implemented currently because it changes how the
invocation of components are organized and need new design, I'd like to implement a simpler poll based watch mechanism,
like read file per 10 seconds should be very enough for the purpose of the build script.

The file system watching based auto rebuild is very cool that it automatically detects source code change, triggers
rebuild, automatically deploy and hot reload, and automatically reloads web page in the end. But my current experience
of lacking file system watching works quite well and I don't need to avoid saving file when I don't want to the
automatic process starting.

By the way, (because seems no other place to talk about this), core module static content handling does not use file
system watching, because that's too unreliable for the purpose, I struggled very long time in old days and finally
settled down at the current fully external command triggered hot reloading design.

### TypeScript

The typescript module is simple for now, you `ts.createProgram`, then `program.emit`, use the second parameter of the
`emit` function to write file into memory, and done the process to type check and transpile typescript for non-project
and non-watching programs.

> Following are old topics and not important.

To make things better, all build targets now leverage the latest features of ECMAScript modules. The previously complex
`target`, `module`, and `moduleResolution` compiler options have been standardized to their `*Next` variants, which
work seamlessly.

To make things better, source maps are no longer supported in the build script, a deliberate decision made during the
AE movement. In the past, the core module relied on source maps to display enhanced error messages. However, this was
identified as a design flaw and has since been rectified. Instead, the minified output is split into multiple lines,
allowing error message location information to remain effective without the overhead of source maps.

To make things better, typescript has introduced several new compiler options for enhanced checking and linting,
enabling the detection of more potential issues. These options have been incorporated into the build script, further
improving code quality and reliability.

To make things better, in old days, the introduction of the `jsx-runtime` concept by React was a notable development.
At the time, I was constrained to React 16 due to compatibility issues with `antd`. To overcome this, I studied the
official JSX runtime source code and implemented a custom JSX runtime. Thankfully, this workaround is no longer
necessary with modern updates.

To make things better, the adoption of CSS-in-JS for styling has eliminated the need to manage separate style files.
This change has streamlined the build process, allowing the TypeScript module to reclaim the `transpile` function,
which was previously used by the now-obsolete `sass` module.

### Lint

The `eslint` package has transitioned from using `eslintrc` to `eslint.config.js`, evolving its configuration model
from `Configuration` to `FlatConfig` over the years. This transition aligns with this project's timeline, with the
final adoption occurring in 2024. The `eslint` component has been upgraded to the latest Node.js API, and several
rules with high false-positive rates have been excluded. These updates have been seamlessly integrated into the build
process.

### Bundle

Bundling is always the core topic of the build script.

> This belief stems from years of reading of the README file, However, revisiting the older content of this document
> reveals a different origin story. The custom bundler was initialy motivated by the limitations of my low
> performance dev machine which struggled to handle the overhead of vscode Remote SSH combined with `webpack`, fine.

The bundler is called `mypack`, provides a streamlined alternative to the industry-standard bundler `webpack`. Unlike
`webpack`, mypack does not bundle vendor modules or rely on a bundler runtime.

Initially designed for backend targets, whose build result can directly import from `node_modules` without the need of
packing vendor packages. Mypack is later adapted for simple web pages that use CDN imports for external dependencies.
Bundling vendor packages adds another level of complexity, while modern ECMAScript module CDN imports address issues
like missing tree shaking in UMD bundles. As a result, mypack is likely to remain no-vendor.

The old implementation of mypack used a conventional approach, wrapping each module in a function and relying on a
bundler runtime to manage relative imports. However, during the AE movement, it became clear that `mypack` primarily
handles simple inputs—few source files, minimal external dependencies, and straightforward relative imports. The
function wrapper pattern also limited `terser`'s ability to optimize across module boundaries. To address these issues,
the bundler is redesigned to directly merge module contents.
The new approach begins by tranversing the TypeScript AST to identify top-level item names and ensure no duplicates.
Import declarations are parsed from JavaScript content instead of the TypeScript AST to simplify filtering out type
imports. External references are consolidated to ensure consistent namespace and default import names across modules,
preventing runtime errors or the need for renaming in all usage locations. Relative imports are analyzed to establish
dependency order and detect recursive dependencies. While these checks are not strictly necessary due to function
hoisting and limited use of global variables, enforcing them improves clarity and structure of module relationships.

> TODO the make script is using typescript AST to collect imports and works well, while considering the defact that
> current parsing implemation does not support multiline import declarations, I maybe change mypack to also work on
> typescript AST later.

For web pages, the old implementation required manually adding `<script>` elements in HTML files to reference CDN URLs.
The new approach leverages ECMAScript module syntax in `<script type="module">` elements, such as
`import React from 'https://somecdn/react@19.1.0'`. Source code uses `import React from 'react'` for TypeScript
language service compatibility, and the module specifier is updated to a CDN URL during the build process. The version
segment in CDN URLs is derived from `package.json` to ensure compatibility. Subpath imports, such as `react-dom/client`
or `dayjs/plugin/utc`, are resolved using longest-match resolution to correctly map dependencies to CDN URLs. Any
unresolved external references result in errors, indicating typos or configuration issues.

> UPDATE for CDN URLs: this approach have error if a package does not specify precise version of a dependency.
> Currently, @emotion/react is specifying react>=16.8 in its dependency, while CDN provider have no way to know I'm
> explicitly specifying react@19.1.1 in my package config, so it resolves the request to newest version react@19.2.0,
> this makes @emotion/react injects its own jsx runtime into the wrong react module, and the web page completely don't
> work. For now, this is temporary resolved by using [`script type=importmap`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules#importing_modules_using_import_maps)
> that manually redirect emotion css's react request to the react version in package config, this manual fix needed to
> be done in all current react pages and need attention to be synced with packcage config. For now I like the CDN URL
> approach and will try to stick on this so maybe think up of automatic approach to check for this issue and handle
> in future.

After resolving imports, module contents are combined by removing import declarations and stripping `export` keywords
from non-entry modules. The combined output is then minified using `terser`. A bundle report summarizes included
modules, their sizes, and the final bundle size, both uncompressed and compressed. This reporting feature is inherited
from the old implementation and inspired by `webpack`'s compilation result display.

### Code Generation

A code generation mechanism has been introduced to streamline the management of boilerplate code when adding, removing
or modifying web APIs. Specifically, it automates the creation of front-end wrappers for `fetch` calls, converting
function parameters to URL parameters, handling authentication, managing errors, and processing response bodies. On the
backend, it generates dispatchers to receive requests from the core module, deserialize them, route them to the
appropriate API implementation functions, collect return values, and handle errors before returning responses to the
core module. This approach simplifies application development by making web API interactions resemble direct function
calls, abstracting away the complexities of web interfaces, reverse proxying, and authentication.

Additionally, a new code generation configuration for database models has been added. It automates the generation of
database table definitions and type definitions, improving backend development efficiency.

The code generation module begins with simple API definitions, generating straightforward wrappers for complex path
segment parameters and a sophisticated separate-process server architecture. Leveraging this experience, I developed an
industry-grade code generation tool capable of handling extensive scales *in my work*, including:

- Hundreds of database tables with over 8000 columns.
- More than 800 web APIs and their types.
- Support for 20+ target types, generating 400+ files with over 200k lines of code across five programming languages.

This scale introduces intricate cross-relationships across the application and development process, such as:

- Validating column default values against column sizes.
- Ensuring table aggregation logic aligns with column data types.
- Maintaining consistent display names for columns across UI and data migration templates.
- Validating API names against allowed table names for specific migration schemas.
- Deriving API types from database types for common fields, simplifying data mapping.
- Managing database schema upgrades while validating release note changes.
- Generating business logic stored procedures and ensuring consistency with backend logic.

All of these features not coming to this project because it's too simple. 😅

input configuration file example `database.xml`:

```xml
<?xml version="1.0" encoding="utf-8" ?>
<database name="YALA">
  <table name="Session">
    <primary-key field="SessionId" />
    <field name="SessionId" type="id" />
    <field name="UserId" type="int" />
    <field name="Name" type="string" size="100" />
    <field name="Comment" type="text?" />
  </table>
  <table name="Message">
    <primary-key field="SessionId,MessageId" />
    <foreign-key field="SessionId" table="Session" />
    <field name="SessionId" type="id" />
    <field name="MessageId" type="int" />
    <field name="Role" type="string" size="32" />
    <field name="Content" type="text" />
  </table>
</database>
```

input configuration file example `api.xml`:

```xml
<?xml version="1.0" encoding="utf-8" ?>
<api name="yala">
  <type name="Session">
    <field name="id" type="id" />
    <field name="name" type="string" />
    <field name="comment" type="string?" />
    <field name="createTime" type="datetime?" />
    <field name="updateTime" type="datetime?" />
  </type>
  <type name="Message">
    <field name="id" type="id" />
    <field name="role" type="string" />
    <field name="content" type="string" />
  </type>
  <type name="ShareSessionResult">
    <field name="id" type="string" />
  </type>
  <!-- this returned entity does not contain messages -->
  <action key="main" name="GetSessions" return="Session[]" />
  <action key="main" name="GetSession" a1="sessionId" return="Session" />
  <!-- for public api, path logic will exclude the Public prefix in name,
    generated backend function call and front end function wrapper will include the Public -->
  <action key="share" name="PublicGetSession" public="true" a1="shareId:guid" return="Session" />
  <action key="main" name="AddSession" body="Session" return="Session" />
  <action key="main" name="UpdateSession" body="Session" return="Session" />
  <action key="main" name="RemoveSession" a1="sessionId" />
  <action key="main" name="AddMessage" a1="sessionId" body="Message" return="Message" />
  <action key="main" name="UpdateMessage" a1="sessionId" body="Message" return="Message" />
  <action key="main" name="RemoveMessageTree" a1="sessionId" a2="messageId" />
  <action key="main" name="CompleteMessage" a1="sessionId" a2="messageId" return="Message" />
</api>
```

The generated api url use hyphen names and query parameters, for example

- `GetSessions()`: `GET /sessions`
- `GetSession(sessionId)`: `GET /session?sessionId=`
- `UpdateSession(session)`: `POST /update-session` and json body
- `RemoveMessageTree(sessionId, messageId)`: `DELETE /remove-message-tree?sessionId=id&messagId=id`

Specification

- `key`: group related actions, for now, main page actions use `main`
- `name`: action name is converted to camelCase in function names at both side
- method: starts with `Get`: `GET`, start with `Add`: `PUT`, start with `Remove`: `DELETE`, others: `POST`
- pathname: remove the `Get` prefix, and change PascalCase to hyphen separated
- arguments `a1`, `a2,`, `a3`, `a4`: may be simple name or `name:type` format
  - if argument name ends with `Id`, argument type is `id`
  - should not use `id` as argument name
  - for now if type is not provided, argument type is always `id`
  - for now available argument types `id`, `guid`
- `body` and `return` normally is custom complex type name, `body` is not allowed in `GET` actions
- `public` use true for public api that does not require authentication,
  full url for normal api is like `https://api.example.com/appname/v1/session?sessionId=123`,
  full url for public api is like `https://api.example.com/appname/public/v1/session?sessionId=abcd`
- action type field type can use `?` to indicate optional, result in typescript interface property optional
- for now action type field types: `id`, `int`, `string`, `datetime`, `bool` and other custom types or array of them
  `id` and `int` use typescript type `number`, `string` and `datetime` use typescript type `string`, `datetime` is iso8601 format
- database column allowed type `id`, `int`, `string`, `datetime`, `guid`, `text`
  for now `id` use `INT` in database

More about multi app structure and app server-core module communication detail see `multi-app.md`.
