
import subprocess
import time
import urllib.request
import json
import os
import signal
import sys

SERVER_SCRIPT = "src/server.py"
PORT = 8000
BASE_URL = f"http://localhost:{PORT}"

print(f"Starting server {SERVER_SCRIPT}...")
server_process = subprocess.Popen(["python", SERVER_SCRIPT], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

try:
    print("Waiting for server to start...")
    time.sleep(5) 
    
    if server_process.poll() is not None:
        print("Server failed to start!")
        out, err = server_process.communicate()
        print("STDOUT:", out)
        print("STDERR:", err)
        sys.exit(1)

    def check_endpoint(path, method="GET", data=None):
        url = f"{BASE_URL}{path}"
        try:
            req = urllib.request.Request(url, method=method)
            req.add_header('Content-Type', 'application/json')
            if data:
                req.data = json.dumps(data).encode('utf-8')
                
            with urllib.request.urlopen(req) as response:
                status = response.status
                body = response.read().decode('utf-8')
                print(f"[SUCCESS] {method} {path} - Status: {status}")
                return json.loads(body)
        except Exception as e:
            print(f"[FAIL] {method} {path} - Error: {e}")
            return None

    # 1. Check basic GETs (should return empty lists or defaults if CSV missing)
    check_endpoint("/api/products")
    check_endpoint("/api/admins")
    check_endpoint("/api/settings")
    check_endpoint("/api/visits")
    check_endpoint("/api/special-offers")
    
    # 2. POST Order
    print("\nTesting Order Creation (CSV Persistence)...")
    order_payload = {
        "id": 12345,
        "customer": {"name": "Test User", "email": "test@example.com"},
        "items": [{"item_no": "TEST-01", "qty": 1}],
        "total": 100
    }
    res = check_endpoint("/api/place-order", method="POST", data=order_payload)
    if res and res.get('status') == 'success':
        print("Order placed successfully.")
    else:
        print(f"Order placement failed: {res}")

    # 3. GET Orders
    print("\nVerifying Order Fetch...")
    orders = check_endpoint("/api/orders")
    if orders and len(orders) > 0:
        print(f"Orders fetched: {len(orders)}")
        print("First Order:", orders[0])
        # Verify JSON parsing of nested fields if implemented
        if isinstance(orders[0].get('items'), list):
            print("Items correctly parsed as list.")
        else:
            print(f"Items type: {type(orders[0].get('items'))} (Expected list)")
    else:
        print("No orders found!")

    # 4. POST Admin (to verify other CSV)
    print("\nTesting Admin Creation...")
    admin_payload = {"username": "testadmin", "password": "password123"}
    check_endpoint("/api/admins", method="POST", data=admin_payload)
    
    admins = check_endpoint("/api/admins")
    if admins:
        print(f"Admins fetched: {len(admins)}")

    print("\nVerification Complete.")
    
except Exception as e:
    print(f"Test Execution Error: {e}")

finally:
    if server_process.poll() is None:
        server_process.kill()
        out, err = server_process.communicate()
        print("\nServer STDOUT:", out)
        print("Server STDERR:", err)
