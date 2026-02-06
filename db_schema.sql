-- Run this script in SQL Server Management Studio (SSMS) to create your tables.

-- 1. Create Database (Skip if you already have one)
-- CREATE DATABASE ProductPromoDB;
-- GO
-- USE ProductPromoDB;
-- GO

-- 2. Create Admins Table
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='admins' AND xtype='U')
BEGIN
    CREATE TABLE admins (
        id INT IDENTITY(1,1) PRIMARY KEY,
        username NVARCHAR(255) NOT NULL UNIQUE,
        password NVARCHAR(255) NOT NULL,
        created_at DATETIME DEFAULT GETDATE()
    );
END

-- 3. Create Visits Table
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='visits' AND xtype='U')
BEGIN
    CREATE TABLE visits (
        date NVARCHAR(20) PRIMARY KEY, -- Format: YYYY-MM-DD
        count INT DEFAULT 0
    );
END

-- 4. Create Settings Table
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='settings' AND xtype='U')
BEGIN
    CREATE TABLE settings (
        [key] NVARCHAR(100) PRIMARY KEY, -- 'key' is a reserved word, escape with brackets
        value NVARCHAR(MAX)
    );
END

-- 5. Seed Default Admin (Optional: Change password immediately)
IF NOT EXISTS (SELECT * FROM admins)
BEGIN
    INSERT INTO admins (username, password) VALUES ('admin', 'admin123');
END
