
import pyodbc

CONN_STR = "DRIVER={ODBC Driver 17 for SQL Server};SERVER=localhost\\SQLEXPRESS;DATABASE=ProductPromoDB;Trusted_Connection=yes;Encrypt=no;TrustServerCertificate=yes"

def inspect():
    try:
        conn = pyodbc.connect(CONN_STR)
        cursor = conn.cursor()
        
        print("--- Columns ---")
        cursor.execute("SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'products'")
        for row in cursor.fetchall():
            print(row)
            
        print("\n--- Constraints ---")
        cursor.execute("SELECT CONSTRAINT_NAME, CONSTRAINT_TYPE FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_NAME = 'products'")
        for row in cursor.fetchall():
            print(row)
            
        conn.close()
    except Exception as e:
        print(e)

if __name__ == '__main__':
    inspect()
