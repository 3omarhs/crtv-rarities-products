
import os
import sys
import csv

# Add src to path
sys.path.append(os.path.abspath('src'))

from server import UnifiedDAO, DATA_DIR, GITHUB_REPO, GITHUB_TOKEN

def test_dao():
    print(f"Testing DAO with DATA_DIR: {DATA_DIR}")
    db = UnifiedDAO(DATA_DIR, GITHUB_REPO, GITHUB_TOKEN)
    
    print("Fetching admins.csv...")
    try:
        admins = db.get_csv("admins.csv")
        print(f"Success! Found {len(admins)} admins.")
        for a in admins:
            print(f" - {a.get('username')}")
    except Exception as e:
        print(f"Error: {e}")

    print("\nFetching products.csv...")
    try:
        start = __import__('time').time()
        products = db.get_csv("products.csv")
        end = __import__('time').time()
        print(f"Success! Found {len(products)} products in {end-start:.4f}s.")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_dao()
