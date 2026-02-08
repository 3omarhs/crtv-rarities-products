import pyodbc
import json
import os

def check_mssql():
    try:
        with open('db_config.json', 'r') as f:
            config = json.load(f)
        
        conn_str = config.get("connection_string")
        print(f"Connecting with: {conn_str}")
        
        conn = pyodbc.connect(conn_str)
        cursor = conn.cursor()
        
        print("Connected to SQL Server!")
        
        # Check for visits table
        cursor.execute("SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'visits'")
        table = cursor.fetchone()
        
        if table:
            print("Table 'visits' exists.")
            # Check columns
            cursor.execute("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'visits'")
            columns = [row[0] for row in cursor.fetchall()]
            print(f"Columns: {columns}")
        else:
            print("Table 'visits' does NOT exist.")
            
        conn.close()
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_mssql()
