import pyodbc
import urllib.request
import json
from datetime import datetime

def check_visits():
    try:
        # 1. Get current count from DB
        with open('db_config.json', 'r') as f:
            config = json.load(f)
        
        conn = pyodbc.connect(config.get("connection_string"))
        cursor = conn.cursor()
        today = datetime.now().strftime('%Y-%m-%d')
        
        cursor.execute("SELECT count FROM visits WHERE date = ?", (today,))
        row = cursor.fetchone()
        initial_count = row[0] if row else 0
        print(f"Initial DB Count for {today}: {initial_count}")
        
        # 2. Hit API
        print("Sending POST to /api/visits...")
        try:
            req = urllib.request.Request('http://localhost:8000/api/visits', method='POST')
            with urllib.request.urlopen(req) as response:
                if response.status == 200:
                   data = json.loads(response.read().decode('utf-8'))
                   print(f"API Response: {data}")
                else:
                   print(f"API Failed: {response.status}")
                   return
        except urllib.error.URLError as e:
             print(f"Server not running on port 8000 or error: {e}")
             print("Please RESTART the server for changes to take effect.")
             return

        # 3. Check DB again
        cursor.execute("SELECT count FROM visits WHERE date = ?", (today,))
        row = cursor.fetchone()
        final_count = row[0] if row else 0
        print(f"Final DB Count for {today}: {final_count}")
        
        if final_count > initial_count:
            print("SUCCESS: Database count increased!")
        else:
            print("FAILURE: Database count did not increase (Server might need restart or using SQLite fallback)")

        conn.close()

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_visits()
