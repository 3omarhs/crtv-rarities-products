import http.server
import socketserver
import json
import os
import urllib.request
import urllib.parse

PORT = 8081
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


        if self.path == '/api/settings':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            try:
                if os.path.exists('email_config.json'):
                    with open('email_config.json', 'r') as f:
                        data = f.read()
                        self.wfile.write(data.encode())
                else:
                    self.wfile.write(json.dumps({}).encode())
            except:
                self.wfile.write(json.dumps({}).encode())
            return

        # Default static file serving
        return super().do_GET()

    def do_POST(self):
        if self.path == '/api/debug-log':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            self.send_response(200)
            self.end_headers()
            
            try:
                log_entry = json.loads(post_data.decode('utf-8'))
                print(f"[CLIENT LOG] {log_entry.get('level', 'INFO')}: {log_entry.get('message')}")
            except Exception as e:
                print(f"Error logging: {e}")
            return
        
        if self.path == '/api/upload-image':
            try:
                content_length = int(self.headers['Content-Length'])
                filename = self.headers.get('X-Filename', 'uploaded_image.jpg')
                filename = os.path.basename(filename) # Sanitize
                
                file_data = self.rfile.read(content_length)
                
                if not os.path.exists('images'):
                    os.makedirs('images')
                    
                filepath = os.path.join('images', filename)
                with open(filepath, 'wb') as f:
                    f.write(file_data)
                    
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success", "url": f"images/{filename}"}).encode())
            except Exception as e:
                print(f"Error uploading image: {e}")
                self.send_response(500)
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode())
            return

        if self.path == '/api/add-product':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            
            try:
                import csv
                product_data = json.loads(post_data.decode('utf-8'))
                
                # CSV Columns (Order matters!)
                columns = [
                    'product name', 'No', 'category', 'collection', 'target market', 
                    'Calculate on Weight', 'Dimensions(mm) x y z', 'description (80 word)', 
                    'Price < 25 QTY', 'Price >=25 QTY', 'discount cal', 'Document Link', 
                    'Discount %', 'calc', 'Name on Store', 'Arabic Name', 'Available', 'Hidden', 'Colors'
                ]
                
                row = []
                for col in columns:
                    val = product_data.get(col, '')
                    row.append(val)
                
                # Ensure CSV exists (it should if downloaded)
                if not os.path.exists('products.csv'):
                    with open('products.csv', 'w', newline='', encoding='utf-8') as f:
                        writer = csv.writer(f)
                        writer.writerow(columns)

                with open('products.csv', 'a', newline='', encoding='utf-8') as f:
                    writer = csv.writer(f)
                    writer.writerow(row)
                
                self.wfile.write(json.dumps({"status": "success"}).encode())
            except Exception as e:
                print(f"Error adding product: {e}")
                self.wfile.write(json.dumps({"error": str(e)}).encode())
            return

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
                import time
                new_order = json.loads(post_data.decode('utf-8'))
                new_order['timestamp'] = time.time()
                new_order['date'] = time.strftime('%Y-%m-%d %H:%M:%S')
                
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
Payment: {new_order.get('paymentMethod', 'Cash on delivery')}

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

                # -----------------------------
                # SEND EMAIL NOTIFICATION
                try:
                    if os.path.exists('email_config.json'):
                        with open('email_config.json', 'r') as f:
                            email_config = json.load(f)
                            
                        if email_config.get('enabled'):
                            import smtplib
                            from email.mime.text import MIMEText
                            from email.mime.multipart import MIMEMultipart

                            sender_email = email_config.get('sender_email')
                            sender_pass = email_config.get('sender_pass')
                            receiver_email = email_config.get('receiver_email')
                            
                            if sender_email and sender_pass and receiver_email:
                                msg = MIMEMultipart()
                                msg['From'] = sender_email
                                msg['To'] = receiver_email
                                msg['Subject'] = f"New Order: {new_order.get('customerName')} - {new_order.get('total')}"

                                body = f"""New Order Details:
Customer: {new_order.get('customerName')}
Phone: {new_order.get('customerPhone')}
Total: {new_order.get('total')}
Payment: {new_order.get('paymentMethod', 'Cash')}

Items:
"""
                                if 'items' in new_order:
                                    for item in new_order['items']:
                                        if isinstance(item, str):
                                            body += f"- {item}\n"
                                        else:
                                            body += f"- {item.get('name')} (x{item.get('quantity')})\n"
                                            
                                msg.attach(MIMEText(body, 'plain'))
                                
                                # Connect to Gmail SMTP (Standard)
                                server = smtplib.SMTP('smtp.gmail.com', 587)
                                server.starttls()
                                server.login(sender_email, sender_pass)
                                server.send_message(msg)
                                server.quit()
                                print("Email notification sent successfully")
                except Exception as e_mail:
                    print(f"Failed to send email: {e_mail}")
                # -----------------------------

                self.wfile.write(json.dumps({"status": "success"}).encode())
            except Exception as e:
                print(f"Error saving order: {e}")
                self.wfile.write(json.dumps({"error": str(e)}).encode())
            return
            
        if self.path == '/api/settings':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            
            try:
                config = json.loads(post_data.decode('utf-8'))
                with open('email_config.json', 'w') as f:
                    json.dump(config, f)
                self.wfile.write(json.dumps({"status": "success"}).encode())
            except Exception as e:
                self.wfile.write(json.dumps({"error": str(e)}).encode())
            return

        self.send_error(501, "Unsupported method (%r)" % self.path)
        return

    def log_message(self, format, *args):
        # Override to ensure flush
        import sys
        sys.stderr.write("%s - - [%s] %s\n" %
                         (self.client_address[0],
                          self.log_date_time_string(),
                          format%args))
        sys.stderr.flush()
        


Handler = CustomHandler

print(f"Serving on port {PORT}", flush=True)
print(f"Visit tracking enabled ({VISITS_FILE})", flush=True)
print(f"Order tracking enabled ({ORDERS_FILE})", flush=True)

# Using ThreadingHTTPServer which is available in Python 3.7+
import http.server
with http.server.ThreadingHTTPServer(("", PORT), Handler) as httpd:
    httpd.serve_forever()
