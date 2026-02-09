
import pandas as pd
import pyodbc
import math

EXCEL_FILE = r'c:\Users\SKYLINE\.gemini\antigravity\scratch\product-promo\3D Printers Comparision.xlsx'
CONN_STR = "DRIVER={ODBC Driver 17 for SQL Server};SERVER=localhost\\SQLEXPRESS;DATABASE=ProductPromoDB;Trusted_Connection=yes;Encrypt=no;TrustServerCertificate=yes"

import re

def clean_float(val):
    if pd.isna(val):
        return None
    s = str(val).strip()
    if s == '':
        return None
    # Extract first float pattern
    match = re.search(r"[-+]?\d*\.\d+|\d+", s)
    if match:
        return float(match.group())
    return None

def clean_val(val):
    if pd.isna(val):
        return None
    s = str(val).strip()
    if s == '':
        return None
    return s

def run_import():
    # ... (reading excel code remains same) ...
    print("Reading Excel...")
    try:
        df = pd.read_excel(EXCEL_FILE, sheet_name='Products')
    except Exception as e:
        print(f"Error reading Excel: {e}")
        return

    # Normalize columns (strip whitespace)
    df.columns = [c.strip() for c in df.columns]
    
    # Prepare data
    records = []
    skipped_count = 0
    
    for index, row in df.iterrows():
        item_no = clean_val(row.get('No'))
        name = clean_val(row.get('Product Name'))
        
        if not item_no: # Skip if no item_no
            skipped_count += 1
            continue
            
        # Refined skip logic: 
        # If 'Product Name' matches 'Product Name' (header row)
        if name == 'Product Name':
            skipped_count += 1
            continue
            
        # Clean numeric fields
        p_low = clean_float(row.get('Price < 25 QTY'))
        p_high = clean_float(row.get('Price >=25 QTY'))
        d_perc = clean_float(row.get('Discount %'))
        
        record = (
            item_no,
            name,
            clean_val(row.get('category')),
            clean_val(row.get('collection')),
            clean_val(row.get('target market')),
            clean_val(row.get('Calculate on Weight')),
            clean_val(row.get('Dimensions(mm) x y z')),
            clean_val(row.get('description (80 word)')),
            p_low,
            p_high,
            clean_val(row.get('discount cal')),
            clean_val(row.get('Document Link')),
            d_perc,
            clean_val(row.get('calc')),
            clean_val(row.get('Name on Store')),
            clean_val(row.get('Arabic Name')),
            clean_val(row.get('Available')),
            clean_val(row.get('Hidden')),
            clean_val(row.get('Colors'))
        )
        records.append(record)

    print(f"Prepared {len(records)} records. Skipped {skipped_count}.")
    
    print("Connecting to DB...")
    try:
        conn = pyodbc.connect(CONN_STR)
        cursor = conn.cursor()
        
        # DROP and RECREATE table to restore ID and ensure clean state
        print("Dropping and recreating 'products' table...")
        cursor.execute("IF OBJECT_ID('products', 'U') IS NOT NULL DROP TABLE products")
        cursor.execute("""
            CREATE TABLE products (
                id INT IDENTITY(1,1) PRIMARY KEY,
                item_no NVARCHAR(255) NOT NULL UNIQUE,
                name NVARCHAR(MAX),
                category NVARCHAR(MAX),
                collection NVARCHAR(MAX),
                target_market NVARCHAR(MAX),
                weight_calc NVARCHAR(MAX),
                dimensions NVARCHAR(MAX),
                description NVARCHAR(MAX),
                price_low_qty DECIMAL(10, 3),
                price_high_qty DECIMAL(10, 3),
                discount_cal NVARCHAR(MAX),
                document_link NVARCHAR(MAX),
                discount_percent DECIMAL(5, 2),
                calc_val NVARCHAR(MAX),
                store_name NVARCHAR(MAX),
                arabic_name NVARCHAR(MAX),
                available NVARCHAR(MAX),
                hidden NVARCHAR(MAX),
                colors NVARCHAR(MAX)
            )
        """)
        
        # INSERT
        print("Inserting records...")
        sql = """
            INSERT INTO products (
                item_no, name, category, collection, target_market, weight_calc, 
                dimensions, description, price_low_qty, price_high_qty, discount_cal, 
                document_link, discount_percent, calc_val, store_name, arabic_name, 
                available, hidden, colors
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """
        
        # Execute line by line to identify bad rows if any
        count = 0
        for r in records:
            try:
                cursor.execute(sql, r)
                count += 1
            except Exception as e:
                print(f"Failed to insert Item: {r[0]}, Name: {r[1]}. Error: {e}")
                
        conn.commit()
        print(f"Successfully inserted {count} rows.")
        conn.close()
        
    except Exception as e:
        print(f"DB Error: {e}")

if __name__ == '__main__':
    run_import()
