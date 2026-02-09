
import pandas as pd
import sqlite3
import os

DB_FILE = 'database.db'
EXCEL_FILE = r'c:\Users\SKYLINE\.gemini\antigravity\scratch\product-promo\3D Printers Comparision.xlsx'

def clean_column_name(col):
    return col.strip().lower().replace(' ', '_').replace('(', '').replace(')', '').replace('<', 'lt').replace('>', 'gt').replace('=', 'eq').replace('%', 'percent').replace('-', '_')

def run_import():
    if not os.path.exists(EXCEL_FILE):
        print(f"File not found: {EXCEL_FILE}")
        return

    print("Reading Excel file...")
    try:
        df = pd.read_excel(EXCEL_FILE, sheet_name='Products')
    except Exception as e:
        print(f"Failed to read Excel: {e}")
        return

    # Clean columns
    df.columns = [clean_column_name(c) for c in df.columns]
    
    # Rename specific columns for clarity
    # 'no' -> 'item_no'
    if 'no' in df.columns:
        df.rename(columns={'no': 'item_no'}, inplace=True)
    
    # 'product_name' -> 'name' (User expectation)
    if 'product_name' in df.columns:
        df.rename(columns={'product_name': 'name'}, inplace=True)
    
    # Filter out empty rows (if any)
    df = df.dropna(how='all')

    print(f"Found {len(df)} rows.")
    print("Columns:", df.columns.tolist())

    conn = sqlite3.connect(DB_FILE)
    
    # Create Columns String for Schema
    # We'll treat everything as TEXT for simplicity unless it's clearly numeric, 
    # but pandas to_sql does a decent job inferring.
    # However, to ensure a clean schema, let's let pandas create it but with 'item_no' as PK?
    # Pandas doesn't support setting PK easily.
    # We will use to_sql with index=False, then maybe add PK manually or just accept it.
    
    TABLE_NAME = 'three_d_printers'
    
    try:
        # Drop if exists
        conn.execute(f"DROP TABLE IF EXISTS {TABLE_NAME}")
        
        # Write to DB
        df.to_sql(TABLE_NAME, conn, if_exists='replace', index=False)
        
        # Add indices or verify
        count = conn.execute(f"SELECT count(*) FROM {TABLE_NAME}").fetchone()[0]
        print(f"Successfully imported {count} rows into table '{TABLE_NAME}'.")
        
        # Check first row
        first_row = conn.execute(f"SELECT * FROM {TABLE_NAME} LIMIT 1").fetchone()
        print("First row sample:", first_row)
        
    except Exception as e:
        print(f"Database error: {e}")
    finally:
        conn.close()

if __name__ == '__main__':
    run_import()
