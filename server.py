import http.server
import socketserver
import json
import os
import urllib.request
import urllib.parse

PORT = 8080
VISITS_FILE = 'visits.txt'
ORDERS_FILE = 'orders.json'

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/api/visits':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            try:
                if os.path.exists(VISITS_FILE):
                    with open(VISITS_FILE, 'r') as f:
                        count = f.read().strip()
                        if not count: count = "0"
                else:
                    count = "0"
            except:
                count = "0"
            self.wfile.write(json.dumps({"visits": int(count)}).encode())
            return
        
        if self.path == '/api/orders':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            try:
                if os.path.exists(ORDERS_FILE):
                    with open(ORDERS_FILE, 'r', encoding='utf-8') as f:
                        data = f.read()
                        orders = json.loads(data) if data else []
                else:
                    orders = []
            except Exception as e:
                orders = []
                print(f"Error reading orders: {e}")
            self.wfile.write(json.dumps(orders).encode())
            return

        # Default static file serving
        return super().do_GET()

    def do_POST(self):
        if self.path == '/api/visits':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            try:
                count = 0
                if os.path.exists(VISITS_FILE):
                    with open(VISITS_FILE, 'r') as f:
                        c = f.read().strip()
                        if c: count = int(c)
                
                count += 1
                
                with open(VISITS_FILE, 'w') as f:
                    f.write(str(count))
                    
                self.wfile.write(json.dumps({"visits": count}).encode())
            except Exception as e:
                print(f"Error updating visits: {e}")
                self.wfile.write(json.dumps({"error": str(e)}).encode())
            return

        if self.path == '/api/orders':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            
            try:
                new_order = json.loads(post_data.decode('utf-8'))
                
                # Save Order
                orders = []
                if os.path.exists(ORDERS_FILE):
                    with open(ORDERS_FILE, 'r', encoding='utf-8') as f:
                        content = f.read()
                        if content:
                            orders = json.loads(content)
                
                orders.append(new_order)
                
                with open(ORDERS_FILE, 'w', encoding='utf-8') as f:
                    json.dump(orders, f, indent=2, ensure_ascii=False)
                
                # --- SEND TWILIO WHATSAPP MESSAGE (Sandbox) ---
                try:
                    if os.path.exists('twilio_config.json'):
                        with open('twilio_config.json', 'r') as f:
                            config = json.load(f)
                            account_sid = config.get('account_sid')
                            auth_token = config.get('auth_token')
                            from_num = config.get('from_number')
                            to_num = config.get('to_number')
                            
                            if account_sid and auth_token and "REPLACE" not in account_sid:
                                # Construct Detailed Message
                                items_str = ""
                                if 'items' in new_order:
                                    for item in new_order['items']:
                                        if isinstance(item, str):
                                            items_str += f"\n{item}"
                                        else:
                                            items_str += f"\n- {item.get('name')} (x{item.get('quantity')})"
                                
                                address_str = "Pickup"
                                if new_order.get('method') == 'delivery':
                                    address_str = f"{new_order.get('selectedRegion')}, {new_order.get('selectedCompany')}\n{new_order.get('address')}"

                                msg_body = f"""New Order from {new_order.get('customerName')}
Phone: {new_order.get('customerPhone')}
Total: {new_order.get('total')}

Items:{items_str}

Delivery:
{address_str}"""
                                
                                # Twilio API Endpoint
                                url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"
                                
                                # Prepare Post Data
                                data = urllib.parse.urlencode({
                                    'To': to_num,
                                    'From': from_num,
                                    'Body': msg_body
                                }).encode()
                                
                                # Prepare Request (Basic Auth)
                                req = urllib.request.Request(url, data=data, method='POST')
                                
                                # Manual Basic Auth Header since we avoid extra libs
                                import base64
                                auth_str = f"{account_sid}:{auth_token}"
                                b64_auth = base64.b64encode(auth_str.encode()).decode()
                                req.add_header("Authorization", f"Basic {b64_auth}")
                                req.add_header("Content-Type", "application/x-www-form-urlencoded")
                                
                                # Send Request
                                try:
                                    with urllib.request.urlopen(req, timeout=10) as response:
                                        print(f"Twilio API Response Code: {response.getcode()}")
                                        print(f"Twilio API Response: {response.read().decode('utf-8')}")
                                        print("Twilio SMS notification sent")
                                except urllib.error.HTTPError as e:
                                    print(f"Twilio API Failed: {e.code} {e.reason}")
                                    print(f"Twilio Error Body: {e.read().decode('utf-8')}")
                            else:
                                print(f"Twilio API Key not configured.")
                except Exception as wa_e:
                    print(f"Failed to send Twilio notification: {wa_e}")
                # -----------------------------

                self.wfile.write(json.dumps({"status": "success"}).encode())
            except Exception as e:
                print(f"Error saving order: {e}")
                self.wfile.write(json.dumps({"error": str(e)}).encode())
            return

        return super().do_POST()

Handler = CustomHandler

print(f"Serving on port {PORT}")
print(f"Visit tracking enabled ({VISITS_FILE})")
print(f"Order tracking enabled ({ORDERS_FILE})")

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    httpd.serve_forever()
