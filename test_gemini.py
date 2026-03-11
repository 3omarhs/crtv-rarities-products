import urllib.request
import json

api_key = "AIzaSyDNDCb82ygt8XBSZWAdJUP672T6-MtYWbs"
model = "gemini-1.5-flash"

# Try v1beta first
url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
payload = {
    "contents": [{"parts": [{"text": "hi"}]}]
}

print(f"Testing URL: {url}")
try:
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as response:
        print("v1beta SUCCESS")
        print(response.read().decode())
except Exception as e:
    print(f"v1beta FAILED: {e}")

# Try v1
url = f"https://generativelanguage.googleapis.com/v1/models/{model}:generateContent?key={api_key}"
print(f"Testing URL: {url}")
try:
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as response:
        print("v1 SUCCESS")
        print(response.read().decode())
except Exception as e:
    print(f"v1 FAILED: {e}")
