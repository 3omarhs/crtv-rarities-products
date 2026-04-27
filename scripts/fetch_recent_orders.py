import os
import psycopg2
from dotenv import load_dotenv
import json

load_dotenv()

def fetch_orders():
    conn_str = os.getenv('DATABASE_URL')
    if not conn_str:
        print("DATABASE_URL not found")
        return
    
    try:
        conn = psycopg2.connect(conn_str)
        cur = conn.cursor()
        cur.execute('SELECT id, "customerName", address, timestamp FROM orders ORDER BY timestamp DESC LIMIT 20')
        rows = cur.fetchall()
        
        results = []
        for row in rows:
            results.append({
                "id": row[0],
                "customerName": row[1],
                "address": row[2],
                "timestamp": str(row[3])
            })
        
        print(json.dumps(results, indent=2))
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    fetch_orders()
