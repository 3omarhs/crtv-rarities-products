
import os
import json
import base64
import urllib.request
import urllib.error

# Config (same as other scripts)
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

    def update_csv(self, path, content_str, message):
        resp = self._request("GET", path)
        sha = resp.get("sha") if resp else None

        content_b64 = base64.b64encode(content_str.encode('utf-8')).decode('utf-8')
        data = { "message": message, "content": content_b64 }
        if sha: data["sha"] = sha
        
        self._request("PUT", path, data)
        print(f"Updated {path}")

def restore_keys():
    github = GitHubDAO(GITHUB_REPO, GITHUB_TOKEN)
    
    # Placeholder key content
    # Header: key
    csv_content = "key\n"
    
    print(f" creating data/gemini_keys.csv...")
    github.update_csv("data/gemini_keys.csv", csv_content, "Initialize Gemini Keys CSV")

if __name__ == "__main__":
    restore_keys()
