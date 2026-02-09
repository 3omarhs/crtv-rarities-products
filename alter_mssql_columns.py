
import pyodbc

CONN_STR = "DRIVER={ODBC Driver 17 for SQL Server};SERVER=localhost\\SQLEXPRESS;DATABASE=ProductPromoDB;Trusted_Connection=yes;Encrypt=no;TrustServerCertificate=yes"

def alter():
    try:
        conn = pyodbc.connect(CONN_STR)
        conn.autocommit = True
        cursor = conn.cursor()
        
        # List of columns to expand
        cols = [
            'name', 'category', 'collection', 'target_market', 
            'weight_calc', 'dimensions', 'description', 
            'discount_cal', 'document_link', 'calc_val', 
            'store_name', 'arabic_name', 'available', 
            'hidden', 'colors', 'raw_csv_row'
        ]
        
        for col in cols:
            print(f"Altering {col} to NVARCHAR(MAX)...")
            try:
                cursor.execute(f"ALTER TABLE products ALTER COLUMN {col} NVARCHAR(MAX)")
            except Exception as e:
                print(f"Failed to alter {col}: {e}")
                
        # price_low_qty, price_high_qty, discount_percent are decimal/float, usually fine?
        # Let's check if they were problematic? 
        # But report said string truncation.
        
        print("Done altering columns.")
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == '__main__':
    alter()
