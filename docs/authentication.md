# Authentication

- Some applications are private and require authentication
  or [Identity and Access Management (IAM)](https://learn.microsoft.com/en-us/entra/fundamentals/identity-fundamental-concepts).
- To avoid duplicating IAM work in each application,
  [Single Sign-On (SSO)](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/what-is-single-sign-on) is used.
- SSO is a concept that requires concrete protocols and implementations.
  In this project, [OAuth 2.0](https://datatracker.ietf.org/doc/html/rfc6749)
  and [OpenID Connect](https://openid.net/specs/openid-connect-core-1_0.html) are not used.

### OAuth 2.0 and OpenID Connect

OAuth 2.0 is an industry-standard protocol for authorization, allowing applications to securely access resources
on a user's behalf without sharing credentials. It provides a framework for delegated access, enabling users to
grant limited permissions to third-party applications. OpenID Connect extends OAuth 2.0 with an identity layer,
supporting authentication in addition to authorization. This enables applications to verify user identities and
obtain basic profile information securely and consistently, making OAuth 2.0 and OpenID Connect fundamental to
modern identity management.

OAuth 2.0 and OIDC is not used here because they do not fit the requirements. OAuth 2.0 is designed for scenarios
involving three parties: an authorization server, a resource server, and a client. In this program, I'd like to
manage users directly and typically use the same server for both the authentication and application proxy.
The resource server concept is primarily for authorization, which is not needed here, and OIDC adds further
complexity with additional protocol requirements and protection from more attack surfaces that are not relevant
to this setup. Additionally, the use of the "JW*" family of standards

- [JWS](https://datatracker.ietf.org/doc/html/rfc7515)
- [JWE](https://datatracker.ietf.org/doc/html/rfc7516)
- [JWK](https://datatracker.ietf.org/doc/html/rfc7517)
- [JWA](https://datatracker.ietf.org/doc/html/rfc7518)
- [JWT](https://datatracker.ietf.org/doc/html/rfc7519)

requires complex cryptographic operations and specialized libraries. Open source implementations like
[authentik](https://goauthentik.io/) and [authelia](https://www.authelia.com/) are comprehensive frameworks
covering everything from database to UI, highlighting the overall complexity of these protocols.

> By the way, Cross Subdomain Single sign-on based on Cookie (CSSC)

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

for reference

1. An end user attempts to access a protected service.
2. The Relying Party (RP, also known as the Client) initiates an authentication request by redirecting the
  user's browser to the OpenID Provider (OP, the authorization server). The request includes parameters:
  - `scope`: Specifies the requested permissions; must include `openid` for OIDC.
  - `response_type`: Typically set to `code` to indicate the authorization code flow.
  - `client_id` and `redirect_uri`: Identify and validate the client and specify where the OP should send the response.
  - `state`: A unique value to prevent CSRF attacks and maintain request integrity.
3. The user authenticates with the OP, for example by entering a username and password or using another
   authentication method and may include use of 2FA or MFA.
4. Upon successful authentication, the OP redirects the user back to the RP's `redirect_uri`,
   including a temporary authorization code and the original `state` value.
5. The RP's backend exchanges the authorization code for tokens by making a secure
   server-to-server request to the OP, authenticating itself with its client credentials. The OP responds with:
  - An ID token (containing user identity claims)
  - An access token (for accessing protected resources)
  - Optionally, a refresh token
6. The RP validates the ID token’s claims (such as `iss`, `sub`, `aud`, `exp`, `iat`) to ensure authenticity
   and integrity, then uses the access token to request additional user information from the OP’s userinfo endpoint
   if needed. The authentication process is now complete, and the RP can proceed with authorization as required.

### Workflow

the actual workflow implemented here

1. An end user attempts to access a protected service.
2. The application (app1.example.com) redirects end user to identity provider (id.example.com),
   parameters only include `return=app1`, the return address will be calculated from this,
   no need to use state parameter because if I accidentally save information to another user, I can fix that in db
3. The user authenticates with the identity provider
4. Upon successful authentication, the identity provider returns to the application with a temporary authorization
   code (app1.example.com?code=randomhexvalue), the application server (or the identity provider server, this is not
   important here) directly checks valid authorization codes and issue an access token to the application client side
5. The application use the access token to access its own api

### Design Principles

- all server side authentication operations happens at `api.example.com`, same as before
- the identity provider need ui, but `api.example.com` does not have ui,
  so the ui is at `id.example.com`, no need to put ui at each application,
  this subdomain also looks better then auth.example.com or login.example.com
- if `id.example.com` is opened with ?return, it will return when or after signed in,
  if opened with no parameter, it is a user management page
- application may open with pathname and query, it should save the pathname or other state before redirection
  and recover after authenticated if need, this makes identity provider parameter looks better
- no static password, only authenticator password (otp password),
  when you don't have normal fixed password, you don't have to remember that and cannot leak password
- identity provider's access token is stored at localstorage is long lived and auto refresh and
  stored in database, same as before
- still use authorization code, not directly send token back, because showing the token on the user
  agent (the browser) is kind of strange and may cause security issues?
- authorization code is stored in memory, it is short lived and no need to recover if server restart,
  it is one time use, any usage will invalidate the authorization code, include error
- use random hex value token, no need to use jwt to convey user information,
  application can directly call the user information api to get user information,
  jwt is designed for stateless, but to implement revoke feature you always need to store which
  makes stateless feature meaningless
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
CREATE TABLE `User` (
  `Id` INT NOT NULL AUTO_INCREMENT,
  `Name` VARCHAR(100) NOT NULL,
  `Active` BIT(1) NOT NULL,
  `Secret` CHAR(16) NOT NULL, -- authenticator secret
  `Apps` VARCHAR(100) NOT NULL, -- comma separated allowed app names
  `CreateTime` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `PK_User` PRIMARY KEY (`Id`)
);

-- this is identity provider's (id.example.com) user session/access token storage
-- application access token is not saved in database
CREATE TABLE `UserSession` (
  `Id` INT NOT NULL AUTO_INCREMENT,
  `UserId` INT NOT NULL,
  `Name` VARCHAR(100) NOT NULL, -- user can name a session to distinguish them
  `AccessToken` CHAR(42) DEFAULT NULL,
  `LastAccessTime` DATETIME DEFAULT NULL, -- token expires after 1 month no access
  `LastAccessAddress` VARCHAR(50) DEFAULT NULL, -- ip
  `CreateTime` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `PK_UserSession` PRIMARY KEY (`Id`),
  CONSTRAINT `FK_UserSession_User` FOREIGN KEY (`UserId`) REFERENCES `User` (`Id`)
);
```

### API Reference

TODO this api list is not complete and may contain outdated information,
you may update this to a not this manual flavor format

- `POST /api/signin`
  - allow origin id.example.com
  - use request header `authorization: Basic {base64 encoded username:password}`
  - response status `200` body `{ accessToken: string }`
  - expected errors include
    - 400 username or password cannot be empty
    - 400 unknown user or incorrect password
  - always creates new device

- `GET /api/signup/:username`
  - allow origin id.example.com
  - response body `{ data: string }` string is data url
  - generate random authenticator token and return qr code image
  - qrcode content `otpauth://totp/example.com:USERNAME?secret=SECRET&period=30&digits=6&algorithm=SHA1&issuer=example.com`
  - this name is signup instead of register/adduser beceause it is same length as signin and have same beginning as signin

- `POST /api/signup`
  - allow origin id.example.com
  - use request header `authorization: Basic {base64 encoded username:secret:password}`
  - response status `200` body `{ accessToken: string }`
  - expected errors include
    - 400 invalid user name
    - 400 incorrect password
  - creates new device (sign in) at the same time

- `GET /api/user-credential`
  - allow origin id.example.com and app.example.com
  - request authorization header `authorization: Bearer token`, all apis except signin/signup need this header
  - response status `200` body `{ id: number, name: string, deviceId: number, deviceName: string }`

- `PATCH /api/user-credential`
  - allow origin id.example.com
  - request body `{ name: string }`
  - response status `201`
  - update user name

- `GET /api/user-devices`
  - allow origin id.example.com
  - response status `200` body `{ id: number, name: string }[]`

- `PATCH /api/user-devices/:deviceid`
  - allow origin id.example.com
  - request body `{ name: string }`
  - response status `201`
  - update device name

- `DELETE /api/user-devices/:deviceid`
  - allow origin id.example.com
  - remove an logged in user device
  - if removed access token is id access token, this also log out id.example.com
  - response status `204` (also for invalid deviceid)
  - physical delete user device (same as `akari remove-device`)

- `POST /api/signout`
  - allow origin app.example.com
  - response status `204`
  - physically delete user device
