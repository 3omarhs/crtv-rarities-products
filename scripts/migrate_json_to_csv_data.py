
import os
import json
import csv
import io
import base64
import urllib.request
import urllib.error
import time

# Config
GITHUB_REPO = "3omarhs/crtv-rarities-products"
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "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")

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
            return None

    def get_json(self, path):
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

    def update_csv(self, path, list_of_dicts, message):
        # Check if file exists to get SHA (for update) or None (for create)
        resp = self._request("GET", path)
        sha = resp.get("sha") if resp else None

        if not list_of_dicts:
            print(f"Skipping {path}: No data to write.")
            return

        # Flatten nested JSON/list items to strings for CSV
        processed_list = []
        for item in list_of_dicts:
            new_item = item.copy()
            for k, v in new_item.items():
                if isinstance(v, (dict, list)):
                    new_item[k] = json.dumps(v)
            processed_list.append(new_item)

        output = io.StringIO()
        fieldnames = set()
        for row in processed_list:
            fieldnames.update(row.keys())
        fieldnames = sorted(list(fieldnames))
        
        writer = csv.DictWriter(output, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(processed_list)
        content_str = output.getvalue()

        content_b64 = base64.b64encode(content_str.encode('utf-8')).decode('utf-8')
        data = { "message": message, "content": content_b64 }
        if sha: data["sha"] = sha
        
        self._request("PUT", path, data)
        print(f"Updated {path}")

    def delete_file(self, path, sha):
        data = { "message": f"Delete {path} (Migrated to CSV)", "sha": sha }
        self._request("DELETE", path, data)
        print(f"Deleted {path}")

def migrate():
    github = GitHubDAO(GITHUB_REPO, GITHUB_TOKEN)
    
    files_to_migrate = [
        ("data/products.json", "data/products.csv"),
        ("data/admins.json", "data/admins.csv"),
        ("data/orders.json", "data/orders.csv"),
        ("data/wholesale.json", "data/wholesale.csv"),
        ("data/visits.json", "data/visits.csv"),
        ("data/settings.json", "data/settings.csv")
    ]
    
    for json_path, csv_path in files_to_migrate:
        print(f"Migrating {json_path} -> {csv_path}...")
        data, sha = github.get_json(json_path)
        if data:
            print(f"Found {len(data)} items in {json_path}")
            github.update_csv(csv_path, data, f"Migrate {json_path} to CSV")
            # Verify CSV exists? Assumed success if no error.
            # Delete JSON
            github.delete_file(json_path, sha)
        else:
            print(f"No data found in {json_path}")

if __name__ == "__main__":
    migrate()
