import sqlite3
import urllib.request
import csv
import io

DB_FILE = 'database.db'
CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSTejg41yuaKcYa0CbOodUP9osmE5DIv8ZNQyMXlHJLLh2pQUZ5EoMT93UgV3LZfhAJcPEL8uEfK9Y4/pub?gid=897526080&single=true&output=csv'

def seed_db():
    print("Fetching CSV...")
    try:
        with urllib.request.urlopen(CSV_URL) as response:
            content = response.read().decode('utf-8')
    except Exception as e:
        print(f"Failed to fetch CSV: {e}")
        return

    # Increase CSV field size limit
    csv.field_size_limit(10 * 1024 * 1024)  # 10MB

    # Parse CSV to inspect headers
    csv_reader = csv.DictReader(io.StringIO(content))
    headers = csv_reader.fieldnames
    print(f"CSV Headers: {headers}")
    
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    
    # Drop table to ensure fresh schema matching CSV
    c.execute('DROP TABLE IF EXISTS products')
    
    c.execute('''
        CREATE TABLE products (
            item_no TEXT PRIMARY KEY,
            name TEXT,
            category TEXT,
            collection TEXT,
            target_market TEXT,
            weight_calc TEXT,
            dimensions TEXT,
            description TEXT,
            price_low_qty TEXT,
            price_high_qty TEXT,
            discount_cal TEXT,
            document_link TEXT,
            discount_percent TEXT,
            calc_val TEXT,
            store_name TEXT,
            arabic_name TEXT,
            available TEXT,
            hidden TEXT,
            colors TEXT
        )
    ''')
    
    rows_to_insert = []
    
    # Helper to safely get value by potential header names
    def g(row, candidates):
        for cand in candidates:
            if cand in row: return row[cand]
            # improved loose match
            for k in row.keys():
                if cand.lower() == k.lower().strip(): return row[k]
                if cand.lower() in k.lower().strip(): return row[k]
        return None

    for row in csv_reader:
        item_no = g(row, ['No', 'Item Number', 'Number', 'id'])
        name = g(row, ['Product Name', 'Name', 'Title'])
        
        if not item_no or not name: continue
        
        rows_to_insert.append((
            item_no,
            name,
            g(row, ['Category']),
            g(row, ['Collection']),
            g(row, ['Target Market']),
            g(row, ['Weight']),
            g(row, ['Dimensions']),
            g(row, ['Description']),
            g(row, ['Price < 25', 'Price', 'Retail Price']),
            g(row, ['Price >= 25', 'Bulk Price', 'Wholesale']),
            g(row, ['Discount Cal']),
            g(row, ['Document Link', 'Link']),
            g(row, ['Discount %']),
            g(row, ['Calc']),
            g(row, ['Store Name']),
            g(row, ['Arabic Name']),
            g(row, ['Available', 'Stock']),
            g(row, ['Hidden']),
            g(row, ['Colors'])
        ))

    c.executemany('''
        INSERT INTO products VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ''', rows_to_insert)
    
    conn.commit()
    print(f"Seeded {len(rows_to_insert)} products.")
    conn.close()

if __name__ == '__main__':
    seed_db()
