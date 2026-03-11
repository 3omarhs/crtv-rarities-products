import http.server
import socketserver
import json
import os
import csv
from datetime import datetime
import base64

def decrypt_key(encrypted_base64, pwd="crtv_secure_2026"):
    try:
        enc_bytes = base64.b64decode(encrypted_base64)
        key_bytes = pwd.encode('utf-8')
        dec_bytes = bytearray(len(enc_bytes))
        for i in range(len(enc_bytes)):
            dec_bytes[i] = enc_bytes[i] ^ key_bytes[i % len(key_bytes)]
        decrypted = dec_bytes.decode('utf-8')
        if decrypted.startswith("AIza"):
            return decrypted
        return encrypted_base64
    except Exception:
        return encrypted_base64


PORT = 8080
DATA_DIR = r"d:\GitHub\crtv-rarities-products\data"
PUBLIC_DIR = r"d:\GitHub\crtv-rarities-products\public"

class DashboardHandler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        # Decode URL path
        from urllib.parse import unquote
        path = unquote(path)
        
        # Serve static files from PUBLIC_DIR
        rel_path = path.lstrip('/')
        if not rel_path or rel_path == 'admin.html':
            return os.path.join(PUBLIC_DIR, 'admin.html')
        
        # Check if the file exists in PUBLIC_DIR
        public_path = os.path.join(PUBLIC_DIR, rel_path)
        if os.path.exists(public_path):
            return public_path
            
        return super().translate_path(path)

    def do_GET(self):
        if self.path == '/api/orders':
            self.serve_csv_as_json('orders.csv')
        elif self.path == '/api/visits':
            self.serve_visits()
        elif self.path == '/api/admins':
            self.serve_csv_as_json('admins.csv')
        elif self.path == '/api/settings':
            self.serve_settings()
        elif self.path == '/api/gemini-keys':
            self.serve_gemini_keys()
        elif self.path == '/api/products':
            self.serve_csv_as_json('products.csv')
        else:
            super().do_GET()

    def serve_csv_as_json(self, filename):
        path = os.path.join(DATA_DIR, filename)
        data = []
        if os.path.exists(path):
            with open(path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    data.append(row)
        
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def serve_visits(self):
        path = os.path.join(DATA_DIR, 'visits.csv')
        total = 0
        daily = {}
        today_count = 0
        today_str = datetime.now().strftime('%Y-%m-%d')
        
        if os.path.exists(path):
            with open(path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    count = int(row.get('count', 0))
                    date = row.get('date')
                    total += count
                    if date:
                        daily[date] = count
                        if date == today_str:
                            today_count = count
        
        res = {
            "total": total,
            "daily": daily,
            "today": today_count,
            "visits": total
        }
        
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(res).encode())

    def serve_settings(self):
        path = os.path.join(DATA_DIR, 'settings.csv')
        settings = {}
        if os.path.exists(path):
            with open(path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    key = row.get('key')
                    if key:
                        settings[key] = row.get('value', '')
        
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(settings).encode())

    def serve_gemini_keys(self):
        path = os.path.join(DATA_DIR, 'gemini_keys.csv')
        keys = []
        if os.path.exists(path):
            with open(path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    k = row.get('key')
                    if k:
                        keys.append(decrypt_key(k))
        
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps({"keys": keys}).encode())

    def do_POST(self):
        if self.path == '/api/proxy-gemini':
            self.serve_proxy_gemini()
        else:
            self.send_response(404)
            self.end_headers()

    def serve_proxy_gemini(self):
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data)
            
            # Get API Key
            key_path = os.path.join(DATA_DIR, 'gemini_keys.csv')
            api_key = None
            if os.path.exists(key_path):
                with open(key_path, 'r', encoding='utf-8') as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        api_key = row.get('key')
                        if api_key:
                            api_key = decrypt_key(api_key)
                            break
            
            if not api_key:
                # Try settings fallback
                settings_path = os.path.join(DATA_DIR, 'settings.csv')
                if os.path.exists(settings_path):
                    with open(settings_path, 'r', encoding='utf-8') as f:
                        reader = csv.DictReader(f)
                        for row in reader:
                            if row.get('key') == 'gemini_credentials_raw':
                                import re
                                match = re.search(r'Gemini API Key: ([A-Za-z0-9_-]+)', row.get('value', ''))
                                if match:
                                    api_key = decrypt_key(match.group(1))
                                    break
            
            if not api_key:
                raise Exception("No Gemini API Key found")

            import urllib.request
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
            payload = {
                "contents": [{
                    "parts": [
                        {"text": data['prompt']},
                        {"inline_data": {"mime_type": data['mimeType'], "data": data['image']}}
                    ]
                }]
            }
            
            req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json'})
            with urllib.request.urlopen(req) as response:
                res_data = response.read()
                
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(res_data)
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())

if __name__ == "__main__":
    print(f"Starting dashboard server on port {PORT}")
    with socketserver.TCPServer(("", PORT), DashboardHandler) as httpd:
        httpd.serve_forever()
