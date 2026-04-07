
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), '../db/database.db')

def migrate():
    if not os.path.exists(DB_PATH):
        print(f"Database not found at {DB_PATH}")
        return

    print(f"Migrating database at {DB_PATH}...")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    try:
        # Check if column exists
        cursor.execute("PRAGMA table_info(special_offers)")
        columns = [info[1] for info in cursor.fetchall()]
        
        if 'category' not in columns:
            print("Adding 'category' column to 'special_offers' table...")
            cursor.execute("ALTER TABLE special_offers ADD COLUMN category TEXT")
            conn.commit()
            print("Migration successful: 'category' column added.")
        else:
            print("'category' column already exists.")
            
    except Exception as e:
        print(f"Migration failed: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
