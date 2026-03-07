
import os
import json
import base64
import urllib.request
import urllib.error
import csv
import io

# Config
GITHUB_REPO = "3omarhs/crtv-rarities-products"
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "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")

def upload_keys():
    # Read local file
    try:
        with open("data/keys.csv", "r", encoding="utf-8") as f:
            content = f.read()
    except Exception as e:
        print(f"Error reading local file: {e}")
        return

    # Prepare API request
    url = f"https://api.github.com/repos/{GITHUB_REPO}/contents/data/keys.csv"
    headers = {
        "Authorization": f"Bearer {GITHUB_TOKEN}",
        "Accept": "application/vnd.github.v3+json",
        "Content-Type": "application/json"
    }

    # Get SHA for update
    req_get = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req_get) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            sha = data.get('sha')
    except urllib.error.HTTPError as e:
        sha = None # Might not exist (though we created it)

    # Update
    content_b64 = base64.b64encode(content.encode('utf-8')).decode('utf-8')
    payload = {
        "message": "Update Gemini Keys from Local",
        "content": content_b64
    }
    if sha: payload["sha"] = sha

    req_put = urllib.request.Request(url, headers=headers, method="PUT")
    req_put.data = json.dumps(payload).encode('utf-8')

    try:
        with urllib.request.urlopen(req_put) as resp:
            print("Successfully uploaded keys to GitHub!")
    except urllib.error.HTTPError as e:
        print(f"Error uploading: {e.code} {e.read().decode('utf-8')}")

if __name__ == "__main__":
    upload_keys()
