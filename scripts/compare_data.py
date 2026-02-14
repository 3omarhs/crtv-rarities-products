import pandas as pd
import sys
import os

# Force UTF-8 for console output
sys.stdout.reconfigure(encoding='utf-8')

# Updated paths
EXCEL_FILE = r"db\3D Printers Comparision.xlsx"
CSV_FILE = r"db\3D Printers Comparision - Products (1).csv"

try:
    print(f"Reading Excel file: {EXCEL_FILE} ...")
    if not os.path.exists(EXCEL_FILE):
        print("Excel file not found!")
        sys.exit(1)

    try:
        df_excel = pd.read_excel(EXCEL_FILE)
    except Exception as e:
        print(f"Failed to read Excel file: {e}")
        sys.exit(1)
        
    print(f"Excel loaded. Shape: {df_excel.shape}")
    
    # Normalize headers
    df_excel.columns = [str(c).strip() for c in df_excel.columns]
    
    # Find Arabic column by index if name match fails, or loose match
    arabic_col_excel = next((col for col in df_excel.columns if "Arabic" in col), None)
    if not arabic_col_excel and len(df_excel.columns) > 15:
         arabic_col_excel = df_excel.columns[15]

    if arabic_col_excel:
        print(f"Using Excel Arabic Column: '{arabic_col_excel}'")
    else:
        print("No Arabic column found in Excel.")

    # ---------------------------------------------------------

    print(f"\nReading Local CSV file: {CSV_FILE} ...")
    if not os.path.exists(CSV_FILE):
        print("CSV file not found!")
        sys.exit(1)

    try:
        df_csv = pd.read_csv(CSV_FILE)
    except Exception as e:
        print(f"Failed to read CSV file: {e}")
        sys.exit(1)
    
    # Normalize headers
    df_csv.columns = [str(c).strip() for c in df_csv.columns]
    
    print(f"CSV loaded. Shape: {df_csv.shape}")
    
    arabic_col_csv = next((col for col in df_csv.columns if "Arabic" in col), None)
    if arabic_col_csv:
        print(f"Using CSV Arabic Column: '{arabic_col_csv}'")
    else:
        print("No Arabic column found in CSV.")

    print("\nComparing items...")
    
    id_col_excel = next((col for col in df_excel.columns if "No" in col or "Item" in col), None)
    id_col_csv = next((col for col in df_csv.columns if "No" in col or "Item" in col or "id" == col.lower()), None)
    
    # Force rename for merge
    if id_col_excel:
        df_excel['normalized_id'] = df_excel[id_col_excel].astype(str).str.strip()
    if id_col_csv:
        df_csv['normalized_id'] = df_csv[id_col_csv].astype(str).str.strip()

    if id_col_excel and id_col_csv:
        print(f"Comparing using ID columns: Excel['{id_col_excel}'] vs CSV['{id_col_csv}']")
        
        merged = pd.merge(df_excel, df_csv, on='normalized_id', how='inner', suffixes=('_excel', '_csv'))
        
        print(f"Matched {len(merged)} items.")
        
        if arabic_col_excel and arabic_col_csv:
            matches = 0
            mismatches = 0
            print("-" * 50)
            for idx, row in merged.iterrows():
                # Get values safely
                val_excel = str(row.get(arabic_col_excel + '_excel', row.get(arabic_col_excel, ''))).strip()
                val_csv = str(row.get(arabic_col_csv + '_csv', row.get(arabic_col_csv, ''))).strip()
                
                # Treat nan as empty string
                if val_excel == 'nan': val_excel = ''
                if val_csv == 'nan': val_csv = ''

                if val_excel == val_csv:
                    matches += 1
                else:
                    mismatches += 1
                    if mismatches <= 10:
                        print(f"Mismatch ID {row['normalized_id']}:")
                        print(f"  Excel: '{val_excel}'")
                        print(f"  CSV:   '{val_csv}'")
            
            print("-" * 50)
            print(f"Arabic Name Comparison: {matches} matches, {mismatches} mismatches.")
            
            if mismatches == 0:
                print("SUCCESS: All Arabic names match perfectly!")
        else:
            print("Could not compare Arabic names (Missing columns).")
        
    else:
        print("Could not identify ID columns for comparison.")

except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
