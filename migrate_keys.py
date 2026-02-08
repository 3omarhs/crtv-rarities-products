import pyodbc
import json
import os

CONFIG_FILE = 'db_config.json'

def get_config():
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, 'r') as f:
            return json.load(f)
    return {}

def migrate():
    config = get_config()
    conn_str = config.get("connection_string", "")
    
    if not conn_str:
        print("Error: No connection string found in db_config.json")
        return

    try:
        conn = pyodbc.connect(conn_str)
        cursor = conn.cursor()
        
        # Create Table
        print("Creating ApiKeys table...")
        cursor.execute("""
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ApiKeys' AND xtype='U')
            CREATE TABLE ApiKeys (
                Id INT IDENTITY(1,1) PRIMARY KEY,
                KeyValue NVARCHAR(255) NOT NULL UNIQUE,
                IsActive BIT DEFAULT 1,
                CreatedAt DATETIME DEFAULT GETDATE()
            )
        """)
        conn.commit()
        
        # Keys to insert
        keys = [
            "AIzaSyDsZ93bej2UhTNaUBj5aW4a6xDTSKlePEc",
            "AIzaSyDaWoBWbl2H-7L6AtWyKcpVjBWgCmdaAjk",
            "AIzaSyDzhYkKKlIl2sK2HNH5fqK2Eq2I1EX8XwI",
            "AIzaSyBx5JhGAyHf2ol9e6aPd4TbneeEfwtU4Q0"
        ]
        
        print("Inserting keys...")
        for k in keys:
            # Check if exists
            cursor.execute("SELECT COUNT(*) FROM ApiKeys WHERE KeyValue = ?", (k,))
            if cursor.fetchone()[0] == 0:
                cursor.execute("INSERT INTO ApiKeys (KeyValue) VALUES (?)", (k,))
                print(f"Inserted: {k[:10]}...")
            else:
                print(f"Skipped (Exists): {k[:10]}...")
        
        conn.commit()
        conn.close()
        print("Migration Complete.")
        
    except Exception as e:
        print(f"Migration Failed: {e}")

if __name__ == "__main__":
    migrate()
