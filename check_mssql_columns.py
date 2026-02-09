
import pyodbc

CONN_STR = "DRIVER={ODBC Driver 17 for SQL Server};SERVER=localhost\\SQLEXPRESS;DATABASE=ProductPromoDB;Trusted_Connection=yes;Encrypt=no;TrustServerCertificate=yes"

def check():
    try:
        conn = pyodbc.connect(CONN_STR)
        cursor = conn.cursor()
        cursor.execute("SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'products'")
        for row in cursor.fetchall():
            print(row)
        conn.close()
    except Exception as e:
        print(e)

if __name__ == '__main__':
    check()
