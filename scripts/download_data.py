import urllib.request
import json
import os
import base64
import csv
import io

# Configuration from server.py (mirrored here)
GITHUB_REPO = "3omarhs/crtv-rarities-products"
GITHUB_TOKEN = "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"
DATA_FILES = [
    "data/products.csv",
    "data/wholesale.csv",
    "data/orders.csv",
    "data/visits.csv",
    "data/settings.csv",
    "data/admins.csv",
    "data/keys.csv"
]

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
LOCAL_DATA_DIR = os.path.join(PROJECT_ROOT, 'data')

def download_file(path):
    url = f"https://api.github.com/repos/{GITHUB_REPO}/contents/{path}"
    headers = {
        "Authorization": f"Bearer {GITHUB_TOKEN}",
        "Accept": "application/vnd.github.v3+json"
    }
    
    print(f"Downloading {path}...")
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode('utf-8'))
            content_b64 = data.get("content", "")
            content_str = base64.b64decode(content_b64).decode('utf-8')
            
            local_path = os.path.join(PROJECT_ROOT, path)
            os.makedirs(os.path.dirname(local_path), exist_ok=True)
            
            with open(local_path, 'w', encoding='utf-8') as f:
                f.write(content_str)
            print(f"Successfully saved to {local_path}")
    except Exception as e:
        print(f"Failed to download {path}: {e}")

if __name__ == "__main__":
    os.makedirs(LOCAL_DATA_DIR, exist_ok=True)
    for f in DATA_FILES:
        download_file(f)
