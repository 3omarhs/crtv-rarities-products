import sqlite3
import os

DB_FILE = 'db/database.db'

if not os.path.exists(DB_FILE):
    print("Database file not found.")
else:
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = cursor.fetchall()
    
    print(f"Found {len(tables)} tables:")
    for table in tables:
        tname = table[0]
        cursor.execute(f"SELECT COUNT(*) FROM {tname}")
        count = cursor.fetchone()[0]
        print(f" - {tname}: {count} rows")
        
        # specific check for special_offers
        if tname == 'special_offers':
             cursor.execute(f"SELECT * FROM {tname}")
             rows = cursor.fetchall()
             print(f"   Sample Data: {rows[:3]}")

    conn.close()
