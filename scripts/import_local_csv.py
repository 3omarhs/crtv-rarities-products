
import os
import json
import csv
import io
import time
import base64
import urllib.request
import urllib.error
import sys

# Config
CSV_FILE = r"db\3D Printers Comparision - Products (1).csv"
GITHUB_REPO = "3omarhs/crtv-rarities-products"
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "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")
UPLOAD_DIR = r"assets\products"

class GitHubDAO:
    def __init__(self, repo, token):
        self.repo = repo
        self.token = token
        self.base_url = f"https://api.github.com/repos/{repo}/contents"

    def _request(self, method, path, data=None):
        url = f"{self.base_url}/{path}"
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Accept": "application/vnd.github.v3+json",
            "Content-Type": "application/json"
        }
        
        req = urllib.request.Request(url, headers=headers, method=method)
        if data:
            req.data = json.dumps(data).encode('utf-8')
            
        try:
            with urllib.request.urlopen(req) as response:
                return json.loads(response.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            print(f"GitHub API Error {e.code}: {e.read().decode('utf-8')}")
            raise

    def get_file(self, path):
        resp = self._request("GET", path)
        if not resp:
            return None, None
        content_b64 = resp.get("content", "")
        sha = resp.get("sha")
        try:
            content_str = base64.b64decode(content_b64).decode('utf-8')
            return json.loads(content_str), sha
        except:
            return None, sha

    def update_file(self, path, content_obj, message, sha=None):
        if not sha:
            _, existing_sha = self.get_file(path)
            sha = existing_sha
        content_str = json.dumps(content_obj, indent=2)
        content_b64 = base64.b64encode(content_str.encode('utf-8')).decode('utf-8')
        data = {"message": message, "content": content_b64}
        if sha: data["sha"] = sha
        return self._request("PUT", path, data)

def count_images_for_product(item_no):
    if not os.path.exists(UPLOAD_DIR): return 0
    count = 0
    try:
        files = os.listdir(UPLOAD_DIR)
        for f in files:
            if not f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp')): continue
            name, _ = os.path.splitext(f)
            if name == item_no:
                count += 1
            elif name.startswith(item_no + '_'):
                 suffix = name[len(item_no)+1:]
                 if suffix.isdigit():
                     count += 1
    except:
        pass
    return count

def import_csv():
    print(f"Reading CSV: {CSV_FILE}")
    if not os.path.exists(CSV_FILE):
        print("File not found!")
        return

    with open(CSV_FILE, 'r', encoding='utf-8') as f:
        csv.field_size_limit(sys.maxsize)
        csv_reader = csv.DictReader(f)
        
        # Helper to safely get value
        def g(row, candidates):
            # 1. Exact match
            for cand in candidates:
                if cand in row: return row[cand]
            
            # 2. Case-insensitive/Trimmed match
            row_keys_normalized = {k.lower().strip(): k for k in row.keys() if k}
            for cand in candidates:
                cand_norm = cand.lower().strip()
                if cand_norm in row_keys_normalized:
                    return row[row_keys_normalized[cand_norm]]
                
                # 3. Partial match (contains)
                for rk, real_key in row_keys_normalized.items():
                    if cand_norm in rk:
                        return row[real_key]
            return None

        products = []
        for row in csv_reader:
            item_no = g(row, ['No', 'Item Number', 'Number', 'id'])
            name = g(row, ['Product Name', 'Name', 'Title'])
            
            if not item_no or not name: continue
            
            img_count = count_images_for_product(item_no)
            
            p = {
                "item_no": item_no,
                "name": name,
                "category": g(row, ['Category']),
                "collection": g(row, ['Collection']),
                "target_market": g(row, ['Target Market']),
                "weight_calc": g(row, ['Weight', 'Calculate on Weight']),
                "dimensions": g(row, ['Dimensions', 'Dimensions(mm) x y z']),
                "description": g(row, ['Description', 'description (80 word)']),
                "price_low_qty": g(row, ['Price < 25', 'Price < 25 QTY']),
                "price_high_qty": g(row, ['Price >= 25', 'Price >=25 QTY']),
                "discount_cal": g(row, ['Discount Cal', 'discount cal']),
                "document_link": g(row, ['Document Link', 'Link']),
                "discount_percent": g(row, ['Discount %']),
                "calc_val": g(row, ['Calc', 'calc_val', 'calc']),
                "store_name": g(row, ['Store Name', 'Name on Store']),
                "arabic_name": g(row, ['Arabic Name']),
                "available": g(row, ['Available']),
                "hidden": g(row, ['Hidden']),
                "colors": g(row, ['Colors']),
                "image_count": img_count,
                # Simple unique ID generation if needed, or stick to item_no logic
                "id": int(float(time.time()) * 1000) 
            }
            products.append(p)
            # Sleep briefly to avoid identical IDs if relying on time
            time.sleep(0.001) 

    print(f"Parsed {len(products)} products.")
    
    github = GitHubDAO(GITHUB_REPO, GITHUB_TOKEN)
    print("Uploading to GitHub...")
    try:
        # Check current SHA
        _, sha = github.get_file("data/products.json")
        res = github.update_file("data/products.json", products, f"Import from local CSV: {len(products)} items", sha)
        print("Success! Response SHA:", res.get('content', {}).get('sha'))
    except Exception as e:
        print(f"Failed to upload: {e}")

if __name__ == "__main__":
    import_csv()
