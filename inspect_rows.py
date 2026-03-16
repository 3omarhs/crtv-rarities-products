
import csv

input_file = r'd:\GitHub\crtv-rarities-products\data\products.csv'

with open(input_file, 'r', encoding='utf-8') as f:
    reader = csv.reader(f)
    header = next(reader)
    print(f"Header length: {len(header)}")
    print(f"Header: {header}")
    
    for i, row in enumerate(reader):
        if len(row) != len(header):
            print(f"Line {i+2}: Column count mismatch! Expected {len(header)}, got {len(row)}")
            if len(row) > len(header):
                print(f"  Extra data: {row[len(header):]}")
        
        # Check for JSON blobs in any column
        for col_idx, col_val in enumerate(row):
            if col_val.startswith('{"action"'):
                print(f"Line {i+2}, Col {col_idx}: Found JSON blob!")
                print(f"  Snippet: {col_val[:100]}...")
        
        if i > 2000: # Limit output
            break
