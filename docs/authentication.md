# Authentication

### Design Principle

- no normal password, only user name and authenticator password
- only require authorization for api call (request to api subdomain)
- random token, live for 1 month, self refresh
- after login user should name the device, user is able to remove some device from authorized device list
- each app has its own login page and device list

> Do not use cookie or single sign-on because cross origin (cross subdomain is also cross origin) cookie have these limitations
> - request from domain.com to sub.domain.com, all set-cookie headers are ignored regardless of cookie domain option SILENTLY
> - request from domain.com to domain.com, set-cookie to sub.domain.com is ignored
> - request from domain.com to domain.com, set-cookie to domain.com or .domain.com, cookie is not sent in request from sub.domain.com to sub2.domain.com
> - request from sub.domain.com to sub2.domain.com, set-cookie to sub.domain.com or sub2.domain.com bot ignored SILENTLY
> - cookies with path sometime disappears in devtool application tab or website information (the lock icon in front of address bar) cookie in use menu, clear all sometimes failed to clear all
> - regardless of domain.com, sub.domain.com and sub2.domain.com are all same ip and same port

### API Reference

- `POST /api/login`
  - request custom header `X-Login-UserName` and `X-Login-Password`
  - response status `200` custom header `X-Access-Token`
  - expected errors include
    - 400 username or password cannot be empty
    - 400 unknown user or incorrect password

- `GET /api/user-credential`
  - request custom header `X-Access-Token`, all apis except login need this header
  - response status `200` body `{ id: number, name: string, device: string }

- `PATCH /api/user-device/:deviceid`
  - request body `{ name: string }`
  - response status `201`

- `GET /api/user-devices`
  - response status `200` body `{ id: number, name: string }[]`

- `DELETE /api/user-devices/:deviceid`
  - amazingly this is logout, although device management page will not allow delete self, logout actually can use this while clearing local stored token
  - response status `204` (also for invalid deviceid)

### Backup

- database tables: 

```sql
CREATE TABLE `User` (
  `Id` INT NOT NULL AUTO_INCREMENT,
  `Name` VARCHAR(100) NOT NULL,
  `Token` CHAR(16) NOT NULL,    -- authenticator token
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
  `CreateTime` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `CreateClientIp` INT UNSIGNED DEFAULT NULL, -- use INET_ATON, INET_NTOA, INET6_ATON, INET6_NTOA to convert from and to
  CONSTRAINT `PK_UserDevice` PRIMARY KEY (`Id`),
  CONSTRAINT `FK_UserDevice_User` FOREIGN KEY (`UserId`) REFERENCES `User` (`Id`)
);
```

- qrcode this text to setup authenticator
otpauth://totp/domain.com:me?secret=ABCDEFG&period=30&digits=6&algorithm=SHA1&issuer=domain.com
