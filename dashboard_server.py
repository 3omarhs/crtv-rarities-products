import http.server
import socketserver
import json
import os
import csv
from datetime import datetime

PORT = 8000
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
                        keys.append(k)
        
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps({"keys": keys}).encode())

if __name__ == "__main__":
    print(f"Starting dashboard server on port {PORT}")
    with socketserver.TCPServer(("", PORT), DashboardHandler) as httpd:
        httpd.serve_forever()
