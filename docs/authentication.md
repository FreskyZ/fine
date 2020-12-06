# Authentication

### Design Principal

- no normal password, only user name and authenticator password
- only require authorization for api call (request to api subdomain)
- 2 tokens (refresh token and access token) are used
  - use access token to access normal api, use refresh token to get new access token
  - access token live for 1 natural day at utc, refresh token live for 7 days (or 168 hours, or 604800 seconds)
  - refresh token itself is refreshed when refreshing access token, this makes user do not need to log in again
    if he's not using the app for longer than 1 week
- login page is at @ (domain.com or www.domain.com) and 
  after login user is able to use app.domain.com (cross subdomain single sign on)
- use cookie mechanism's domain and path property to reduce data transferred for normal use

### State Transfer

1. at initial state, access token is none, refresh token is none
2. open login tab at index page, or open apps require authorization will redirect to index page login tab
3. login success will create and store new refresh token and access token
4. index page and apps (which require authorization, below is same) will use GET /user-credentials to check login state
5. apis accept POST /login and POST /refresh-token will do their expected work if access token is valid, 
   or return 401 if access token is invalid, front end page will try to refresh access token if get 401 and 
   throw error and redirect to login page if POST /refresh-token return 401

### Cross Origin Cookie Issues

1. always Secure, always HttpOnly
2. non cross origin cookie is like
  - (domain.com xhr/fetch) GET domain.com/xxx
  - (server response) Set-Cookie: Name=Value; Path=/; (or) Set-Cookie: Name=Value; Domain=domain.com; Path=/;
  - then the cookie will be sent with all request from domain.com xhr/fetch to domain.com server
3. cross subdomain cookie has limitation that
  - request from domain.com to sub.domain.com, all set-cookie headers are ignored regardless of cookie domain option SILENTLY
  - request from domain.com to domain.com, set-cookie to sub.domain.com is ignored
  - request from domain.com to domain.com, set-cookie to domain.com or .domain.com, cookie is not sent in request from sub.domain.com to sub2.domain.com
  - cookies with path sometime disappears in devtool application tab or website information (the lock icon in front of address bar) cookie in use menu, clear all sometimes failed to clear all
  - YES ALL DOMAIN.COM, SUB.DOMAIN.COM, SUB2.DOMAIN.COM IS SAME IP AND PORT while CHROME/EDGE rejects them all

### Backup

- database table `User`: 

```sql
CREATE TABLE `User`(
  `Id` INT NOT NULL AUTO_INCREMENT,
  `Name` VARCHAR(100) NOT NULL,
  `AuthenticatorToken` CHAR(16) NOT NULL,
  `AccessToken` CHAR(42) DEFAULT NULL,
  `AccessTokenDate` DATE DEFAULT NULL,
  `RefreshToken` CHAR(42) DEFAULT NULL,
  `RefreshTokenTime` DATETIME DEFAULT NULL,
  `CreateTime` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `PK_User` PRIMARY KEY (`Id`)
)
```

- qrcode this text to setup authenticator
otpauth://totp/domain.com:me?secret=ABCDEFG&period=30&digits=6&algorithm=SHA1&issuer=domain.com
