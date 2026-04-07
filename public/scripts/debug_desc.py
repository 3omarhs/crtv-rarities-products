
import csv

def debug_description():
    target_id = 'TYS-0126-130'
    with open('data/products.csv', 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Check ID column (it might be 'No', 'Item Number', etc.)
            # Based on app.js, keys are normalized.
            # Let's check typical keys
            item_no = row.get('No') or row.get('Item No') or row.get('Item Number')
            if item_no and item_no.strip() == target_id:
                desc = row.get('Description') or row.get('Details')
                print(f"DEBUG: Found ID {target_id}")
                print(f"DEBUG: Raw Description: {repr(desc)}")
                if desc:
                    print("DEBUG: Trimmed:", repr(desc.trim())) # Python is .strip()
                    print("DEBUG: Hex dump of first 20 chars:")
                    print(' '.join(f'{ord(c):02x}' for c in desc[:20]))
                return

debug_description()
