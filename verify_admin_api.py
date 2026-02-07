import urllib.request
import urllib.error
import json
import time

BASE_URL = "http://localhost:8000"

def log(msg, status="INFO"):
    print(f"[{status}] {msg}")

def request(method, endpoint, data=None):
    url = f"{BASE_URL}{endpoint}"
    req = urllib.request.Request(url, method=method)
    req.add_header('Content-Type', 'application/json')
    
    if data:
        json_data = json.dumps(data).encode('utf-8')
        req.data = json_data
        
    try:
        with urllib.request.urlopen(req) as response:
            return response.status, response.read().decode('utf-8')
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8')
    except Exception as e:
        return 0, str(e)

def test_products():
    log("Testing GET /api/products...")
    status, body = request('GET', '/api/products')
    if status == 200:
        products = json.loads(body)
        log(f"Success. Fetched {len(products)} products.", "PASS")
        return True
    else:
        log(f"Failed. Status: {status}", "FAIL")
        return False

def test_admin_management():
    username = f"test_admin_{int(time.time())}"
    password = "password123"
    new_password = "newpassword456"

    # 1. Add Admin
    log(f"Testing POST /api/admins (Add {username})...")
    status, body = request('POST', '/api/admins', {"username": username, "password": password})
    if status == 200:
        log("Success. Admin added.", "PASS")
    else:
        log(f"Failed. Status: {status} Response: {body}", "FAIL")
        return False

    # 3. Update Password
    log(f"Testing PUT /api/admins (Update password for {username})...")
    status, body = request('PUT', '/api/admins', {"username": username, "newPassword": new_password})
    if status == 200:
        log("Success. Password updated.", "PASS")
    else:
        log(f"Failed. Status: {status} Response: {body}", "FAIL")
        return False

    # 4. Remove Admin
    log(f"Testing DELETE /api/admins (Remove {username})...")
    status, body = request('DELETE', '/api/admins', {"username": username})
    if status == 200:
        log("Success. Admin removed.", "PASS")
    else:
        log(f"Failed. Status: {status} Response: {body}", "FAIL")
        return False
        
    return True

if __name__ == "__main__":
    print("--- Starting Admin API Verification ---")
    if test_products():
        if test_admin_management():
            print("--- All Tests Passed ---")
        else:
             print("--- Admin Management Tests Failed ---")
    else:
        print("--- Product Tests Failed ---")
