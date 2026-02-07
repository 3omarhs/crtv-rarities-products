import sqlite3
import os

DB_FILE = 'database.db'

if not os.path.exists(DB_FILE):
    print("Database file not found!")
else:
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        
        # Check tables
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = cursor.fetchall()
        print(f"Tables: {tables}")
        
        # Check visits
        if any('visits' in t for t in tables):
            cursor.execute("SELECT * FROM visits")
            rows = cursor.fetchall()
            print(f"Visits Data: {rows}")
        else:
            print("Visits table does not exist.")
            
        conn.close()
    except Exception as e:
        print(f"Error: {e}")
