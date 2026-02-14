
import sqlite3

DB_FILE = 'db/database.db'

try:
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = cursor.fetchall()
    print("Tables:", tables)
    conn.close()
except Exception as e:
    print(f"Error: {e}")
