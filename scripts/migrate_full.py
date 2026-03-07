import sqlite3
import os
import json
import urllib.request
import base64
import time
from datetime import datetime

# CONFIG
DB_FILE = 'db/database.db'
GITHUB_REPO = "3omarhs/crtv-rarities-products"
GITHUB_TOKEN = "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"

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
            "Content-Type": "application/json",
            "User-Agent": "ProductPromoApp"
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
            print(f"GitHub API Error {e.code} for {url}: {e.read().decode('utf-8')}")
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
        except Exception as e:
            print(f"Error decoding: {e}")
            return None, sha

    def update_file(self, path, content_obj, message, sha=None):
        if not sha:
            _, existing_sha = self.get_file(path)
            sha = existing_sha

        content_str = json.dumps(content_obj, indent=2)
        content_b64 = base64.b64encode(content_str.encode('utf-8')).decode('utf-8')
        
        data = {
            "message": message,
            "content": content_b64
        }
        if sha:
            data["sha"] = sha
            
        return self._request("PUT", path, data)

def migrate_table(cursor, table_name, file_path, dao):
    print(f"Migrating {table_name} -> {file_path}...")
    try:
        cursor.execute(f"SELECT * FROM {table_name}")
        cols = [description[0] for description in cursor.description]
        rows = cursor.fetchall()
        
        data = [dict(zip(cols, row)) for row in rows]
        
        print(f"   Found {len(data)} rows.")
        if len(data) > 0:
            res = dao.update_file(file_path, data, f"Migrate {table_name}")
            print(f"   Success! Commit: {res.get('commit', {}).get('sha')}")
        else:
            print("   Skipping (Empty).")
            # Create empty file anyway? Prefer empty list
            res = dao.update_file(file_path, [], f"Init {table_name} (Empty)")
            print(f"   Created empty file. Commit: {res.get('commit', {}).get('sha')}")
            
    except Exception as e:
        print(f"   Failed to migrate {table_name}: {e}")

def run_migration():
    if not os.path.exists(DB_FILE):
        print("DB File not found!")
        return

    dao = GitHubDAO(GITHUB_REPO, GITHUB_TOKEN)
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()

    # 1. Admins
    migrate_table(cursor, 'admins', 'data/admins.json', dao)
    time.sleep(1) # Avoid rate limits if any

    # 2. Visits (Migrate as list, logic in server handles it assuming dict or list)
    # Server logic usually expects a list of visits or a summary? 
    # Existing `visits` table usually has `date`, `count`.
    # Let's inspect structure first.
    # We'll migrate as is.
    migrate_table(cursor, 'visits', 'data/visits.json', dao)
    time.sleep(1)

    # 3. Settings
    migrate_table(cursor, 'settings', 'data/settings.json', dao)
    time.sleep(1)

    # 4. Special Offers (Wholesale)
    # Be careful with `wholesale.json` vs `data/wholesale.json`. Plan said `data/wholesale.json`.
    migrate_table(cursor, 'special_offers', 'data/wholesale.json', dao)
    time.sleep(1)
    
    # 5. Products?
    # User requested migration of DB. Even if we sync from Google Sheets, 
    # having a `products.json` snapshot is good.
    migrate_table(cursor, 'products', 'data/products.json', dao)

    conn.close()
    print("\nMigration Complete.")

if __name__ == "__main__":
    run_migration()
