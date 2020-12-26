# User Stories


```sql
CREATE TABLE `WIMMRecord` (
  `Id` INT NOT NULL AUTO_INCREMENT,
  `Title` VARCHAR(100) NOT NULL,
  `Type` VARCHAR(10) NOT NULL,
  `Amount` DECIMAL(10, 2) NOT NULL, -- I'm not expecting my cost/income will be large than 100m
  `Tags` VARCHAR(1000) NULL,
  `TransferFromId` INT NULL,
  `TransferIntoId` INT NULL,
  `Time` DATETIME NOT NULL, -- this is auto filled when adding record, user is able to change the time
  `UserId` INT NOT NULL,
  `CreateTime` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,     -- this is reserved internal timestamp
  `LastUpdateTime` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, -- this is reserved internal timestamp
  CONSTRAINT `PK_WIMMRecord` PRIMARY KEY (`Id`),
  CONSTRAINT `FK_WIMMRecord_User` FOREIGN KEY (`UserId`) REFERENCES `User` (`Id`),
  CONSTRAINT `FK_WIMMRecord_TransferFromId` FOREIGN KEY (`TransferFromId`) REFERENCES `WIMMAccount` (`Id`),
  CONSTRAINT `FK_WIMMRecord_TransferIntoId` FOREIGN KEY (`TransferIntoId`) REFERENCES `WIMMAccount` (`Id`)
);

CREATE TABLE `WIMMAccount` (
  `Id` INT NOT NULL AUTO_INCREMENT,
  `Name` VARCHAR(100) NOT NULL,
  `Balance` DECIMAL(10, 2) NOT NULL,
  `UserId` INT NOT NULL,
  `CreateTime` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `PK_WIMMAccount` PRIMARY KEY (`Id`),
  CONSTRAINT `FK_WIMMAccount_User` FOREIGN KEY (`UserId`) REFERENCES `User` (`Id`)
);
```