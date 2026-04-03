import re
import csv

with open('supabase_seed.sql', 'r', encoding='utf-8') as f:
    sql = f.read()

matches = re.finditer(r"INSERT INTO orders \((.*?)\) VALUES \((.*?)\) ON CONFLICT", sql, re.DOTALL)
headers = ['id', 'address', 'currency', 'customerName', 'customerPhone', 'date', 'items', 'method', 'paymentMethod', 'selectedCompany', 'selectedRegion', 'status', 'timestamp', 'total', 'deliveryCost']

rows = []
for match in matches:
    cols_str = match.group(1).replace(' ', '')
    vals_str = match.group(2)
    
    parts = []
    curr = ''
    in_quote = False
    i = 0
    while i < len(vals_str):
        c = vals_str[i]
        if c == "'":
            if i + 1 < len(vals_str) and vals_str[i+1] == "'":
                curr += "'"
                i += 1
            else:
                in_quote = not in_quote
        elif c == ',' and not in_quote:
            parts.append(curr.strip())
            curr = ''
        else:
            curr += c
        i += 1
    parts.append(curr.strip())
    
    row_dict = {}
    cols = cols_str.split(',')
    for col, val in zip(cols, parts):
        val = val.replace('\n', '\\n').replace('\r', '') # Prevent broken CSV rows
        row_dict[col] = val
    
    row = []
    for h in headers:
        row.append(row_dict.get(h, ''))
    rows.append(row)

with open('data/orders.csv', 'w', newline='', encoding='utf-8') as f:
    writer = csv.writer(f)
    writer.writerow(headers)
    writer.writerows(rows)
print('Orders migrated.')
