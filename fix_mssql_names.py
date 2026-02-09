
import pandas as pd
import pyodbc
import os

EXCEL_FILE = r'c:\Users\SKYLINE\.gemini\antigravity\scratch\product-promo\3D Printers Comparision.xlsx'
CONN_STR = "DRIVER={ODBC Driver 17 for SQL Server};SERVER=localhost\\SQLEXPRESS;DATABASE=ProductPromoDB;Trusted_Connection=yes;Encrypt=no;TrustServerCertificate=yes"

def run_fix():
    print("Reading Excel...")
    df = pd.read_excel(EXCEL_FILE, sheet_name='Products')
    
    # Ensure columns exist
    # Based on previous output: ' Product Name' has a leading space
    # And 'No'
    
    print(f"Excel Columns: {df.columns.tolist()}")
    
    updates = []
    for index, row in df.iterrows():
        item_no = row.get('No')
        # Try both 'Product Name' and ' Product Name'
        name = row.get('Product Name')
        if pd.isna(name):
             name = row.get(' Product Name')
        
        if pd.notna(item_no) and pd.notna(name):
            updates.append((str(name).strip(), str(item_no).strip()))
            
    print(f"Found {len(updates)} records to update.")
    
    print("Connecting to SQL Server...")
    try:
        conn = pyodbc.connect(CONN_STR)
        cursor = conn.cursor()
        
        # Check if table exists
        try:
            cursor.execute("SELECT count(*) FROM products")
            cnt = cursor.fetchone()[0]
            print(f"Table 'products' has {cnt} rows.")
        except Exception as e:
            print(f"Error checking table: {e}")
            return

        print("Updating records...")
        updated_count = 0
        
        # Batch update or single? Single is safer for feedback
        for name, item_no in updates:
            cursor.execute("UPDATE products SET name = ? WHERE item_no = ?", (name, item_no))
            updated_count += cursor.rowcount
            
        conn.commit()
        print(f"Updated {updated_count} rows.")
        
        # Verify a few
        print("Sample check (first 5 with non-null names):")
        cursor.execute("SELECT TOP 5 item_no, name FROM products WHERE name IS NOT NULL")
        rows = cursor.fetchall()
        for r in rows:
            print(r)
            
        conn.close()
        
    except Exception as e:
        print(f"Database Error: {e}")

if __name__ == '__main__':
    run_fix()
