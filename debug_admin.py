
import urllib.request
import urllib.error

def check_url(url):
    print(f"Checking {url}...")
    try:
        with urllib.request.urlopen(url) as response:
            print(f"Status: {response.getcode()}")
            content = response.read().decode('utf-8')
            print(f"Content Preview: {content[:100]}")
    except urllib.error.HTTPError as e:
        print(f"HTTP Error: {e.code} {e.reason}")
    except Exception as e:
        print(f"Error: {e}")
    print("-" * 20)

check_url("http://127.0.0.1:8081/admin.html")
check_url("http://127.0.0.1:8081/adminCredentials.txt")
check_url("http://127.0.0.1:8081/admin.js")
