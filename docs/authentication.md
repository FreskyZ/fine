## Authentication

### Basic Design

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

- no normal password, only user name and authenticator password
- api.domain.com/login save refresh token in cookie and only send for api.domain.com/refresh
- api.domain.com/refresh save access token for all api.domain.com/* and renew refresh token
- refresh token exists for 7 days (exact 168 hours after issueing), access token only valid for one day (the natural day at utc)
- for frontend, if api received 501, then directly open login modal, because backend ensures token valid if logged in in near 7 days
- login modal send user name and password to api.domain.com/login
- cache access token in memory for an hour to speed up api invocation

- add qrcode generator for this text:
otpauth://totp/domain.com:me?secret=ABCDEFG&period=30&digits=6&algorithm=SHA1&issuer=domain.com
