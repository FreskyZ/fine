# Authentication

The core module implements authentication so apps don't need to duplicate the work.

### Single Sign-on

if you forget, single sign-on allows user to
sign in one app and don't need to input user credentials again in another app,
if you forget, the major issue in cross subdomain single sign-on
is localstorage/cookie DON'T share between subdomains, because different subdomain is different origin,

> if you blame this file you can find me failed to implement cookie based cross subdomain single sign-on,
> because cookies lie to me that they support cross subdomain, but they actually very not support that,
> but now after more than 4 years I come back with knowledge and experience from using OAuth!

and the solution is send "the string" through url

### Design Principles

This authentication scheme is inspired by OAuth but not exactly the same

> OAuth 2.0: https://datatracker.ietf.org/doc/html/rfc6749

- roles:
  - resource server: api.domain.com/* apis, accessing them need authentication
  - client: app.domain.com web pages
  - authorization endpoint, the web page at id.domain.com to input username and password
  - authorization server, the server part of id.domain.com

- authorization endpoint is id.domain.com, because api.domain.com does not have ui
  and this name is short and reasonable and looks better than auth.domain.com or login.domain.com
- for query parameters, response type is not needed, it is fixed authorization code,
  client_id is app name, redirect uri is not needed, it is determined by client id,
  scope is not needed, because authorization is implemented in each app,
  state is not needed, I control all the user accounts and all apps and their data, no need to specifically avoid that,
  so the actual authorization endpoint looks like id.domain.com/authorize?app=appname
- how the authorization endpoint implements its own authentication is out of oauth specification's scope,
  in this program, it is normal user name and password input, but password is otp password, normal password is not used,
  when you don't have normal fixed password, you don't have to remember that and their is no potential leak problem
- after authenticated user name and password input, id.domain.com stores the access token in httponly cookie,
  which automatically sends in request and automatically expire, and then generates authorization code and calls back
  to app's pages by url, then app's front end page calls this module

no refresh token, because id.domain.com's access token works as refresh token,
and it is rarely used (when a new page of app is opened) and id.domain.com access token is stored in httponly cookie,
and app access token is stored in memory not local storage or cookie

- authorization endpoint is id.domain.com, which is short and looks better than auth.domain.com and login.domain.com
- redirect uri parameter is not needed, because client id is app name and redirect uri can be determined by that


- no normal password, only user name and otp password
- only require authentication for part of the api calls

TODO use URLPattern instead of pattern


### Design Principle

- no normal password, only user name and authenticator password
- only require authentication for api call (request to api subdomain)
- random token, live for 1 month, self refresh
- after sign in user should name the device, user is able to remove some device from authorized device list
- each app has its own login page and device list

> Do not use cookie or single sign-on because cross origin (cross subdomain is also cross origin) cookie have these limitations
> - request from domain.com to sub.domain.com, all set-cookie headers are ignored regardless of cookie domain option SILENTLY
> - request from domain.com to domain.com, set-cookie to sub.domain.com is ignored
> - request from domain.com to domain.com, set-cookie to domain.com or .domain.com, cookie is not sent in request from sub.domain.com to sub2.domain.com
> - request from sub.domain.com to sub2.domain.com, set-cookie to sub.domain.com or sub2.domain.com bot ignored SILENTLY
> - cookies with path sometime disappears in devtool application tab or website information (the lock icon in front of address bar) cookie in use menu, clear all sometimes failed to clear all
> - regardless of domain.com, sub.domain.com and sub2.domain.com are all same ip and same port

### Data Structure

```sql
CREATE TABLE `User` (
  `Id` INT NOT NULL AUTO_INCREMENT,
  `Name` VARCHAR(100) NOT NULL,
  `Token` CHAR(16) NOT NULL,    -- authenticator token
  `Active` BIT(1) NOT NULL,
  `CreateTime` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `PK_User` PRIMARY KEY (`Id`)
);

CREATE TABLE `UserDevice` (
  `Id` INT NOT NULL AUTO_INCREMENT,
  `App` VARCHAR(20) NOT NULL,
  `Name` VARCHAR(100) NOT NULL,
  `Token` CHAR(42) DEFAULT NULL,
  `UserId` INT NOT NULL,
  `LastAccessTime` DATETIME DEFAULT NULL,  -- token expires after 1 month no access
  `LastAccessAddress` VARCHAR(50) DEFAULT NULL, -- ip
  `CreateTime` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `PK_UserDevice` PRIMARY KEY (`Id`),
  CONSTRAINT `FK_UserDevice_User` FOREIGN KEY (`UserId`) REFERENCES `User` (`Id`)
);
```

### API Reference

- `POST /api/signin`
  - request custom header `X-Name` and `X-Token`
  - response status `200` body `{ accessToken: string }`
  - expected errors include
    - 400 username or password cannot be empty
    - 400 unknown user or incorrect password
  - always creates new device

- `GET /api/signup/:username`
  - response body `{ data: string }` string is data url
  - generate random authenticator token and return qr code image
  - qrcode content `otpauth://totp/domain.com:USERNAME?secret=SECRET&period=30&digits=6&algorithm=SHA1&issuer=domain.com`
  - // this name is signup instead of register/adduser beceause it is same length as signin and have same beginning as signin

- `POST /api/signup`
  - request custom header `X-Name`, `X-Token`, token is `${secret}:${token}`
  - response status `200` body `{ accessToken: string }`
  - expected errors include
    - 400 invalid user name
    - 400 incorrect password
  - creates new device (sign in) at the same time

- `GET /api/user-credential`
  - request custom header `X-Token`, all apis except signin/signup need this header
  - response status `200` body `{ id: number, name: string, deviceId: number, deviceName: string }`

- `PATCH /api/user-credential`
  - request body `{ name: string }`
  - response status `201`
  - update user name

- `GET /api/user-devices`
  - response status `200` body `{ id: number, name: string }[]`

- `PATCH /api/user-devices/:deviceid`
  - request body `{ name: string }`
  - response status `201`
  - update device name

- `DELETE /api/user-devices/:deviceid`
  - amazingly this is logout, although device management page will not allow delete self, logout actually can use this while clearing local stored token
  - response status `204` (also for invalid deviceid)
  - physical delete user device (same as `akari remove-device`)
