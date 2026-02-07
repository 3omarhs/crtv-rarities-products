
import sqlite3
import os

DB_FILE = 'database.db'

if not os.path.exists(DB_FILE):
    print("database.db does not exist.")
    exit()

try:
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("SELECT count(*) FROM products")
    count = c.fetchone()[0]
    print(f"Products count: {count}")
    conn.close()
except Exception as e:
    print(f"Error: {e}")
