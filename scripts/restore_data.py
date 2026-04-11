import csv
import os
import re

def repair_products(current_path, backup_path, output_path):
    print(f"Repairing {current_path} using {backup_path}...")
    
    # 1. Load backup mapping (item_no -> arabic_name)
    # The backup header is: arabic_name, ..., item_no, ...
    mapping = {}
    with open(backup_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            item_no = row.get('item_no') or row.get('No')
            arabic = row.get('arabic_name') or row.get('Arabic Name')
            if item_no and arabic:
                mapping[item_no.strip()] = arabic.strip()
    
    print(f"Loaded {len(mapping)} Arabic names from backup.")

    # 2. Read current corrupted file
    # Current header has some weirdness around "Product Name"
    with open(current_path, 'r', encoding='utf-8') as f:
        content = f.read()
        # Remove suspected BOM at start if present
        content = content.lstrip('\ufeff')
        
    rows = list(csv.reader(content.splitlines()))
    if not rows: return
    
    headers = rows[0]
    # Find column indices
    try:
        no_idx = -1
        arabic_idx = -1
        for i, h in enumerate(headers):
            h_clean = h.strip().lower()
            if h_clean == 'no': no_idx = i
            if 'arabic' in h_clean: arabic_idx = i
            
        if no_idx == -1 or arabic_idx == -1:
            print("Could not find 'No' or 'Arabic Name' column in current file.")
            print("Headers:", headers)
            return
            
        fixed_count = 0
        for i in range(1, len(rows)):
            item_no = rows[i][no_idx].strip()
            if item_no in mapping:
                rows[i][arabic_idx] = mapping[item_no]
                fixed_count += 1
        
        # 3. Write output
        with open(output_path, 'w', encoding='utf-8', newline='') as f:
            writer = csv.writer(f)
            writer.writerows(rows)
            
        print(f"Successfully repaired {fixed_count} Arabic names in products.csv")
    except Exception as e:
        print(f"Error repairing products: {e}")

if __name__ == "__main__":
    current_prod = r"d:\GitHub\crtv-rarities-products\data\products.csv"
    backup_prod = r"d:\GitHub\crtv-rarities-products\data\products_backup.csv"
    output_prod = r"d:\GitHub\crtv-rarities-products\data\products_fixed.csv"
    
    repair_products(current_prod, backup_prod, output_prod)
