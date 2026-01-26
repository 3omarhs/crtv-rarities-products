
import urllib.request
import json

def test_status_update():
    # 1. Create a dummy order first (optional, but let's assume one exists or create one)
    # Actually, let's just try to update an existing one if we know ID, or fail gracefully.
    # We can fetch orders first.
    
    try:
        # Fetch orders
        with urllib.request.urlopen("http://127.0.0.1:8081/api/orders") as res:
            orders = json.loads(res.read().decode())
            
        if not orders:
            print("No orders to test with.")
            return

        target_id = orders[0]['id']
        print(f"Testing with Order ID: {target_id}")
        
        # Update Status
        req = urllib.request.Request(
            "http://127.0.0.1:8081/api/update-order-status", 
            data=json.dumps({"orderId": target_id, "status": "Delivery"}).encode(),
            headers={'Content-Type': 'application/json'},
            method='POST'
        )
        
        with urllib.request.urlopen(req) as res:
            print(f"Update Response: {res.read().decode()}")
            
        # Verify persistence
        with urllib.request.urlopen("http://127.0.0.1:8081/api/orders") as res:
            updated_orders = json.loads(res.read().decode())
            for o in updated_orders:
                if o['id'] == target_id:
                    print(f"Verified Status: {o.get('status')}")
                    break
                    
    except Exception as e:
        print(f"Test Failed: {e}")

test_status_update()
