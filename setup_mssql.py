import pyodbc
import json
import os
import re

BASE_DIR = os.getcwd()
CONFIG_FILE = os.path.join(BASE_DIR, 'db_config.json')
SCHEMA_FILE = os.path.join(BASE_DIR, 'db_schema.sql')

def get_config():
    with open(CONFIG_FILE, 'r') as f:
        return json.load(f)

def run_setup():
    config = get_config()
    if not config.get("use_sql_server"):
        print("SQL Server is not enabled in db_config.json")
        return

    # 1. Connect to MASTER to create DB
    conn_str = config["connection_string"]
    # Replace database=... with database=master
    master_conn_str = re.sub(r'DATABASE=[^;]+', 'DATABASE=master', conn_str, flags=re.IGNORECASE)
    
    print(f"Connecting to SQL Server (master)...")
    try:
        conn = pyodbc.connect(master_conn_str, autocommit=True)
    except Exception as e:
        print(f"Failed to connect to master: {e}")
        print("Check if SQL Server is running and SERVER name is correct.")
        return

    cursor = conn.cursor()

    # 2. Create Database if not exists
    print("Checking database ProductPromoDB...")
    try:
        cursor.execute("SELECT database_id FROM sys.databases WHERE Name = 'ProductPromoDB'")
        if not cursor.fetchone():
            print("Creating ProductPromoDB...")
            cursor.execute("CREATE DATABASE ProductPromoDB")
            print("Database created.")
        else:
            print("ProductPromoDB already exists.")
    except Exception as e:
        print(f"Error checking/creating DB: {e}")
        conn.close()
        return
    
    conn.close()

    # 3. Connect to Target DB and Create Tables
    print("Connecting to ProductPromoDB to create tables...")
    try:
        conn = pyodbc.connect(conn_str, autocommit=True)
        cursor = conn.cursor()
        
        # Define table creation SQL explicitly to avoid parsing issues with the file
        queries = [
            """
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='admins' AND xtype='U')
            BEGIN
                CREATE TABLE admins (
                    id INT IDENTITY(1,1) PRIMARY KEY,
                    username NVARCHAR(255) NOT NULL UNIQUE,
                    password NVARCHAR(255) NOT NULL,
                    created_at DATETIME DEFAULT GETDATE()
                );
            END
            """,
            """
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='visits' AND xtype='U')
            BEGIN
                CREATE TABLE visits (
                    date NVARCHAR(20) PRIMARY KEY,
                    count INT DEFAULT 0
                );
            END
            """,
            """
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='settings' AND xtype='U')
            BEGIN
                CREATE TABLE settings (
                    [key] NVARCHAR(100) PRIMARY KEY,
                    value NVARCHAR(MAX)
                );
            END
            """,
            """
            IF NOT EXISTS (SELECT * FROM admins)
            BEGIN
                INSERT INTO admins (username, password) VALUES ('admin', 'admin123');
            END
            """
        ]

        for q in queries:
            cursor.execute(q)
            
        print("Tables created/verified successfully.")
        conn.close()
        print("\nSUCCESS! You can now check SSMS (Right-click Databases > Refresh).")

    except Exception as e:
        print(f"Error creating tables: {e}")

if __name__ == "__main__":
    run_setup()
