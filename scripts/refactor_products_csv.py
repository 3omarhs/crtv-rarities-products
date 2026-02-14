
import re

SERVER_FILE = 'src/server.py'

with open(SERVER_FILE, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace load_products
# Old:
# def load_products():
#     """Download products from GitHub JSON (cached)."""
#     try:
#         products, _ = github.get_file("data/products.json")
#         if not products: return []
#         return products
#     except:
#         return []

NEW_LOAD_PRODUCTS = r'''def load_products():
    """Download products from GitHub CSV (cached)."""
    try:
        products, _ = github.get_csv("data/products.csv")
        if not products: return []
        return products
    except:
        return []'''

# Replace sync_products_from_sheet
# It ends with:
#         try:
#              # Get current to get SHA
#              _, sha = github.get_file("data/products.json")
# ...
# github.update_file("data/products.json", products, f"Sync {len(products)} products", sha)

# We need to find the function and replace the final update call.
# Actually, sync_products_from_sheet is long.
# Let's replace the whole function or regex replace the calls.

# Regex to find load_products
content = re.sub(r'def load_products\(\):[\s\S]*?return products[\s\S]*?except:[\s\S]*?return \[\]', NEW_LOAD_PRODUCTS, content, count=1)

# Modify sync_products_from_sheet calls
# Replace get_file("data/products.json") with get_csv("data/products.csv")
content = content.replace('github.get_file("data/products.json")', 'github.get_csv("data/products.csv")')
# Replace update_file("data/products.json", ...) with update_csv("data/products.csv", ...)
content = content.replace('github.update_file("data/products.json"', 'github.update_csv("data/products.csv"')

# Also update get_product_by_no to ensure comparison works (CSV reads as strings)
# Old: if str(p.get('item_no')) == str(item_no):
# This should still work because both casts to str.

# Also update api/special-offers enrichment to handle string prices if necessary
# In do_GET /api/special-offers:
# offer_data["price"] = product.get('price')
# If product loaded from CSV, 'price' is a string.
# If frontend expects number, might be an issue?
# Frontend JS usually handles loose types, but let's check.
# JS: `offer.price` used in calculation?
# Usually better to ensure it's safe. But `load_products` now returns strings.
# The original JSON `load_products` returned numbers because JSON has types.
# CSV does NOT have types.
# So `load_products` returning CSV data will have all strings.
# This MIGHT break frontend if it expects numbers and does math like `product.price + 10`.
# Users code `app.js` usually parses: `parseFloat(product.price)`.
# Let's assume frontend is robust or update `load_products` to cast known fields?
# Too risky to guess schema.
# I will inspect `app.js` later.

with open(SERVER_FILE, 'w', encoding='utf-8') as f:
    f.write(content)
