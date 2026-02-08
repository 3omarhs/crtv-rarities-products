import sqlite3
import json

def dump_settings():
    try:
        conn = sqlite3.connect('database.db')
        cursor = conn.cursor()
        cursor.execute("SELECT key, value FROM settings")
        rows = cursor.fetchall()
        
        print("--- DOMAIN SETTINGS DUMP ---")
        found_keys = False
        for key, value in rows:
            print(f"KEY: {key}")
            print(f"VALUE: {value}")
            if 'gemini' in key.lower() or 'credential' in key.lower():
                found_keys = True
        
        if not found_keys:
             # Maybe raw in a value?
             for key, value in rows:
                 if 'AIza' in str(value):
                     print(f"FOUND AIza KEY IN SETTING: {key}")

    except Exception as e:
        print(f"Error: {e}")
    finally:
        if conn: conn.close()

if __name__ == "__main__":
    dump_settings()
