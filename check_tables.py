import pyodbc
import json

def check_tables():
    try:
        with open('db_config.json', 'r') as f:
            config = json.load(f)
        
        conn_str = config.get("connection_string")
        conn = pyodbc.connect(conn_str)
        cursor = conn.cursor()
        
        tables = ['admins', 'products', 'settings']
        for t in tables:
            cursor.execute(f"SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = '{t}'")
            if cursor.fetchone():
                print(f"Table '{t}' exists.")
            else:
                print(f"Table '{t}' does NOT exist.")
            
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_tables()
