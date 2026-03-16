import csv
import os

input_file = r'd:\GitHub\crtv-rarities-products\data\products.csv'
temp_file = r'd:\GitHub\crtv-rarities-products\data\products_temp.csv'

# New data for TLS-0226-137
new_row_values = {
    'Product Name': 'Magic Tap Wand',
    'No': 'TLS-0226-137',
    'category': 'Personal Accessories - Payment & Novelty Gadgets',
    'collection': 'Fairy Pay Collection',
    'target market': 'Fairies & Funny People',
    'Calculate on Weight': '67',
    'Dimensions(mm) x y z': '158*23*274',
    'description (80 word)': 'This is a novelty payment accessory designed to bring a touch of magic to everyday transactions. Shaped like a charming star-tipped wand, it allows users to perform contactless payments by simply tapping the wand on any compatible credit or debit card reader. It\'s an imaginative and fun alternative to traditional cards, perfect for those who enjoy whimsical gadgets and want to stand out. Compatible with any credit or debit card, it transforms the mundane act of paying into an enchanting experience, often seen trending on social media platforms like Instagram and TikTok for its unique appeal.',
    'Price < 25 QTY': '3.35',
    'Price >=25 QTY': '3.35',
    'Name on Store': 'Magical Payment Wand: Tap Your Way to Enchanted Transactions',
    'Arabic Name': 'عصا الدفع السحرية',
    'Available': 'TRUE',
    'Hidden': 'FALSE',
    'Colors': 'Black, Beige'
}

try:
    with open(input_file, 'r', encoding='utf-8') as f_in, open(temp_file, 'w', encoding='utf-8', newline='') as f_out:
        reader = csv.DictReader(f_in)
        writer = csv.DictWriter(f_out, fieldnames=reader.fieldnames)
        writer.writeheader()
        for row in reader:
            if row['No'] == 'TLS-0226-137':
                for k, v in new_row_values.items():
                    if k in row:
                        row[k] = v
            writer.writerow(row)
    
    # Replace the original file
    os.replace(temp_file, input_file)
    print("Successfully updated TLS-0226-137 in products.csv")

except Exception as e:
    print(f"Error updating CSV: {e}")
    if os.path.exists(temp_file):
        os.remove(temp_file)
