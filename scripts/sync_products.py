import csv
import io
import os

current_path = r"d:\GitHub\crtv-rarities-products\data\products.csv"
spreadsheet_path = r"C:\Users\omarh\.gemini\antigravity\brain\1680ae4d-9350-45aa-8d0a-58da7317c7f3\.system_generated\steps\664\content.md"
output_path = r"d:\GitHub\crtv-rarities-products\data\products_fixed.csv"

# 1. Load Arabic Mapping from Spreadsheet
arabic_mapping = {}
with open(spreadsheet_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()
    # Filter lines that look like CSV data (contain commas)
    csv_content = "".join([l for l in lines if "," in l])
    reader = csv.DictReader(io.StringIO(csv_content))
    for row in reader:
        item_no = row.get('No', '').strip()
        arabic_name = row.get('Arabic Name', '').strip()
        if item_no and arabic_name and '?' not in arabic_name:
            arabic_mapping[item_no] = arabic_name

print(f"Loaded {len(arabic_mapping)} Arabic names from Spreadsheet.")

# 2. Define Manual Patches for the late products
manual_patches = {
    "ISLMC-0226-141": "ديكور خط عربي \"عيد مبارك\" أنيق",
    "ISLMC-0226-142": "طقم مشابك عيدية بخط عربي احتفالي",
    "ISLMC-0226-143": "حامل حلويات شكل أرنب لطيف",
    "ISLMC-0226-144": "حامل هدايا مالية \"مفاجأة حلوة\"",
    "TLS-0226-145": "ولاعة وموزع سجائر سريع السحب",
    "TLS-0226-146": "أداة تضفير الشعر السهلة",
    "TLS-0226-147": "مشبك شاي على شكل قطة ساحرة",
    "TLS-0226-148": "فتاحة علب مزدوجة المفعول غطاء صحي",
    "TLS-0226-149": "مقبض وفتاحة علب تكتيكية بشكل قنبلة",
    "JWHLD-1225-012": "حامل عرض مجوهرات إضافي"
}

# 3. Read Current Products and Update
products = []
with open(current_path, 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    fieldnames = reader.fieldnames
    for row in reader:
        item_no = row.get('No', '').strip()
        # Strategy: Spreadsheet first, then Manual Patch
        if item_no in arabic_mapping:
            row['Arabic Name'] = arabic_mapping[item_no]
        if item_no in manual_patches:
            row['Arabic Name'] = manual_patches[item_no]
        products.append(row)

# 4. Write Output
with open(output_path, 'w', encoding='utf-8', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(products)

print(f"Successfully synced and patched {len(products)} products to {output_path}")
