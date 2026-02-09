
import pandas as pd
import os

file_path = r'c:\Users\SKYLINE\.gemini\antigravity\scratch\product-promo\3D Printers Comparision.xlsx'

if not os.path.exists(file_path):
    print(f"Error: File not found at {file_path}")
    exit(1)

try:
    df = pd.read_excel(file_path, sheet_name='Products')
    print("Columns found:")
    for col in df.columns:
        print(f"- {col}")
    print("\nFirst 3 rows:")
    print(df.head(3).to_markdown())
except Exception as e:
    print(f"Error reading Excel file: {e}")
