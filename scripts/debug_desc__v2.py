
import csv
import sys

def debug_description():
    target_id = 'TYS-0126-130'
    try:
        with open('data/products.csv', 'r', encoding='utf-8') as f:
            reader = csv.reader(f)
            headers = next(reader)
            print(f"DEBUG: Headers: {headers}")
            
            # Find column indices
            desc_idx = -1
            id_idx = -1
            
            for i, h in enumerate(headers):
                h_norm = h.strip().lower()
                if 'description' in h_norm or 'details' in h_norm:
                    desc_idx = i
                if 'no' in h_norm or 'number' in h_norm:
                    id_idx = i
            
            if desc_idx == -1 or id_idx == -1:
                print("DEBUG: Could not find description or ID column.")
                return

            print(f"DEBUG: ID Index: {id_idx}, Description Index: {desc_idx}")

            for row in reader:
                if len(row) > id_idx:
                    item_id = row[id_idx].strip()
                    if item_id == target_id:
                        desc = row[desc_idx] if len(row) > desc_idx else ""
                        print(f"DEBUG: Found ID {target_id}")
                        print(f"DEBUG: Raw Description: {repr(desc)}")
                        print(f"DEBUG: Trimmed: {repr(desc.strip())}")
                        print("DEBUG: Hex dump of first 50 chars:")
                        print(' '.join(f'{ord(c):02x}' for c in desc[:50]))
                        return
            print("DEBUG: ID not found.")

    except Exception as e:
        print(f"DEBUG: Error: {e}")

debug_description()
