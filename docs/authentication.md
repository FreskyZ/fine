# Authentication

- first, some applications are private and require access control or Identity and Access Management (IAM),
  also see https://www.cloudflare.com/learning/access-management/what-is-identity-and-access-management/
- to avoid duplicating IAM work in each application, use Single Sign-On (SSO),
  also see https://www.cloudflare.com/learning/access-management/what-is-sso/
- SSO is a concept that requires concrete protocols and implementations,
  in this project, OAuth 2.0 https://datatracker.ietf.org/doc/html/rfc6749
  and OpenID Connect https://openid.net/specs/openid-connect-core-1_0.html are **NOT** used.

### OAuth 2.0 and OpenID Connect

OAuth 2.0 is an *authorization* protocol, allow applications to securely access resources on a user's behalf,
without directly sharing credentials, without immediately grant all permissions to 3rd party libraries with
user configured scope limitation. OpenID Connect extends OAuth 2.0 with an identity layer, support
*authentication* in addition to authorization. This enables applications to verify user identities and obtain
basic profile information securely and consistently, making OAuth 2.0 and OpenID Connect widely used in modern
identity management.

> by the way, you can now oauth and oidc authenticate into postgresql

OAuth 2.0 and OIDC is not used here because they do not fit the requirements. OAuth 2.0 is designed with *3*
involving parties: an authorization server, a resource server, and a client. This project manage users on its
own and use the same server for both the authentication, authorization and application proxy. The resource
server concept is primarily for authorization, which is not needed here, and OIDC adds further complexity with
additional protocol requirements and protection from more attack surfaces that are not relevant to this setup.

Additionally, the use of the JW* family of standards

- [JWS](https://datatracker.ietf.org/doc/html/rfc7515)
- [JWE](https://datatracker.ietf.org/doc/html/rfc7516)
- [JWK](https://datatracker.ietf.org/doc/html/rfc7517)
- [JWA](https://datatracker.ietf.org/doc/html/rfc7518)
- [JWT](https://datatracker.ietf.org/doc/html/rfc7519)

requires complex cryptographic operations and specialized libraries, open source implementations
like [authentik](https://goauthentik.io/) and [authelia](https://www.authelia.com/) is very complex
to learn and configure, indicating the complexity of these protocols

By the way, about Cross Subdomain Single sign-on based on Cookie (CSSC),
If you blame this document you might notice I never managed to implement CSSC. While cookies are supposed
to work across subdomains, browsers seem to *hate* this feature and rarely respect it in practice. I suspect
browsers have a long-standing grudge against cookies - after all, in the early days of frontend engineering,
cookies caused plenty of security headaches. As a result, modern browsers make cross subdomain cookies
unreliable, and most web apps avoid them altogether. So, I abandoned the idea and settled for a separate
login and user management page for each application (each subdomain), all sharing a common backend API.
This solution worked, but it was inconvenient for years. However, after gaining experience with OAuth and
OIDC, I finally discovered the real answer to sharing authentication across subdomains is...

*send the text through url*

### OIDC Workflow

for reference and comparison

1. An end user attempts to access a protected service.
2. The Relying Party (RP, also known as the Client) initiates an authentication request by redirecting the
  user's browser to the OpenID Provider (OP, the authorization server). The request includes parameters:
  - `scope`: Specifies the requested permissions; must include `openid` for OIDC
  - `response_type`: Typically set to `code` to indicate the authorization code flow
  - `client_id` and `redirect_uri`: Identify and validate the client and specify OP return address
  - `state`: A unique value to prevent CSRF attacks and maintain request integrity
3. The user authenticates with the OP, for example by entering a username and password
  or using other authentication schemes and may include use of 2FA or MFA.
4. Upon successful authentication, the OP redirects the user back to the RP's `redirect_uri`,
  including a temporary authorization code and the original `state` value.
5. The RP's backend exchanges the authorization code for tokens by making a secure
  server-to-server request to the OP, authenticating itself with its client credentials. The OP responds with:
  - An ID token (containing user identity claims)
  - An access token (for accessing protected resources)
  - Optionally, a refresh token
6. The RP validates the ID token's claims (such as `iss`, `sub`, `aud`, `exp`, `iat`) to ensure authenticity
  and integrity, then uses the access token to request additional user information from the OP's userinfo endpoint
  if needed.

The authentication process is now complete, the RP can now proceed to access the resource with access token,
optionally refresh the access token with refresh token

### Workflow

the actual workflow implemented for this project

1. An end user attempts to access a private application.
2. The application (app1.example.com) redirects end user to identity provider (id.example.com),
  parameters only include return address `return=https://${location.host}`,
  no need to use state parameter, the allowed clients are all good and can be trusted
3. The user authenticates with the identity provider
4. Upon successful authentication, the identity provider returns to the application with a temporary authorization
   code (app1.example.com?code=randomhexvalue), the application server (or the identity provider server, this is not
   important here) directly checks valid authorization codes and issue an access token to the application client side
5. The application use the access token to access its api and resources

### Design Principles

- all server side authentication operations happens at `api.example.com`, same as before
- the identity provider need ui, but `api.example.com` does not have ui,
  so the ui is at `id.example.com`, no need to put ui at each application,
  this subdomain also looks better then auth.example.com or login.example.com
- if `id.example.com` is opened with ?return, it will return when or after signed in,
  if opened without such parameter, it is a user profile page
- application may open with pathname and query, it should save the pathname or other state before redirection
  and recover after authenticated if need, this makes identity provider parameter looks better
- no static password, only authenticator password (otp password),
  when you don't have normal fixed password, you don't have to remember a password and cannot leak the password
- identity provider's access token is stored at localstorage is long lived and auto refresh and
  stored in database, same as before
- still use authorization code, not directly send token back, because showing the token on the user
  agent (the browser) is kind of strange and may cause security issues?
- authorization code is stored in memory, it is short lived and no need to recover if server restart,
  it is one time use, any usage will invalidate the authorization code, include error
- use random hex value token, no need to use jwt to convey user information,
  application can directly call the user information api to get user information,
  jwt is designed for stateless, but to support revoke, you always need to store which makes stateless design
  meaningless, also there is a pattern that if a used authorization code is used again, it indicates a compromise
  in the authentication process and you should revoke the access, this also need to save state, making
  the jwt concept more meaningless
- still auto refresh access token at server side, eliminate the requirements to refresh token workflow
- application's access token is stored in memory and not in localstorage or similar storage,
  open page will automatically require new access token, this token is stored in server memory not database
- public api is served at `api.example.com/appname/public/v1/...`, public api have more strict rate limit

### Security Considerations

References:

- [OAuth 2.0 Security Considerations](https://datatracker.ietf.org/doc/html/rfc6749#section-10)
- [OAuth 2.0 Bearer Token Security](https://datatracker.ietf.org/doc/html/rfc6750#section-5)
- [OAuth 2.0 more Security Considerations](https://datatracker.ietf.org/doc/html/rfc6819)
- [OIDC Security Considerations](https://openid.net/specs/openid-connect-core-1_0.html#Security)

After reviewing these documents, most concerns are not applicable to this implementation due to the following:

- HTTPS is standard today, mitigating MITM risks that were more relevant when OAuth 2.0 was introduced.
- JWT is not used, so related signature and validation issues do not apply.
- Server-side secrets are secured; direct server compromise is outside this scope.
- No use of `redirect_uri`, so redirection vulnerabilities are avoided.
- The identity provider and client run on the same server, eliminating the need for client validation and token audience checks.
- Authorization-specific issues (e.g., misconfigured scopes) are not relevant, as this module focuses solely on authentication.
- I'm correctly educated to checking HTTPS certificate and domain name before entering user
  credentials and will not tell my user credentials to other people.

As a result, the main security risks are limited to

- my source code bugs
- my dependency vulnerabilities
- my cloud service provider issues
- my network environment issues

These are general risks and not specific to the authentication design described here.

### Data Structure

```sql
CREATE TABLE "user" (
  "id" INT PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
  "name" VARCHAR(100) NOT NULL,
  "active" BOOLEAN NOT NULL,
  "secret" VARCHAR(32) NOT NULL, -- authenticator secret, otplib@13 change default to 20, result in length 32 text representation
  "apps" TEXT[] NOT NULL,
  "create_time" TIMESTAMP(0) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP(0)
);

-- this is identity provider's (id.example.com) user session/access token storage
-- application access token is not saved in database
CREATE TABLE "user_session" (
  "id" INT PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
  "user_id" INT NOT NULL REFERENCES "user",
  "name" VARCHAR(100) NOT NULL, -- user can name a session to distinguish them
  "access_token" CHAR(42),
  "last_access_time" TIMESTAMP(0) WITH TIME ZONE, -- token expires after 1 month no access
  "last_access_address" INET,
  "create_time" TIMESTAMP(0) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP(0)
);
```

### API Reference

some of the related actions, may not be complete and may be out of date

- POST id.example.com/signin
  - request header `authorization: Basic {base64 encoded username:password}`
  - return 200 { accessToken: string }
  - error 400 invalid user name or password (empty value, not exist user, inactive user, etc.)
- GET id.example.com/signup
  - return 200 { a: boolean } indicate allow sign up
- GET id.example.com/signup?name={username}
  - check user name
  - generate an otp secret and return the secret and otp url as image as dataurl
  - return 200 { secret: string, dataurl: string }
  - error 400 empty user name
  - error 400 user name already exists
  - in theory should return an opaque id of secret to avoid secret leak, but not needed lazy for now
  - path should change to POST /prepare-signup?
- POST id.example.com/signup
  - request header `authorization: Basic {base64 encoded username:secret:password}`
  - return 200 { accessToken: string }
  - error 400 empty user name
  - error 400 user name already exists
  - error 400 invalid password
  - this name is signup instead of register/adduser beceause it is same length as signin and have same beginning as signin
- GET id.example.com/user-credential
  - require authentication
  - return 200 { id: number, name: string, sessionId: number, sessionId: string }
- PATCH id.example.com/user-credential
  - require authentication
  - body { name: string }
  - update user name
  - return 201
  - error 400 user name already exist
- GET id.example.com/user-sessions
  - require authentication
  - return 200 { id: number, name: string, lastAccessTime: string, lastAccessAddress: string }[]
- PATCH id.example.com/user-sessions?id={session-id}
  - require authentication
  - body { name: string }
  - update session name
  - return 201
  - error 400 invalid session id
  - error 400 invalid session name
- DELETE id.example.com/user-sessions?id={session-id}
  - require authentication
  - return 204
  - revoke session
  - error 400 invalid session id
- POST id.example.com/generate-authorization-token
  - require authentication
  - body { return: string }
  - validate return address and validate return address against user, create authorization code with 1min lifetime
  - return 200 { code: string }
  - error 403 user is not allowed to access the application
- POST notid.example.com/signin
  - request header `authorization: Basic {base64 encoded authorization code}`
  - return 200 { accessToken: string }
  - error 400 invalid authorization code
  - error 401 (inactive user, app now allowed, revoked session)
  - create application session, note this is same as session in id.example.com, this session is volatile
- GET notid.example.com/user-credential
  - require authentication
  - return 200 { id: number, name: string }
- POST notid.example.com/signout
  - require authentication
  - return 204
  - sign out
  - by the way, if you don't find id.example.com's sign out, that is DELETE user-session
