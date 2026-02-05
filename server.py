import http.server
import socketserver
import os
import json
import mimetypes
import time
from datetime import datetime

PORT = 8000
BASE_DIR = os.getcwd()
DB_FILE = os.path.join(BASE_DIR, 'data.json')
AD_FILE = os.path.join(BASE_DIR, 'adminCredentials.txt')
VISITS_FILE = os.path.join(BASE_DIR, 'visits.json')
UPLOAD_DIR = os.path.join(BASE_DIR, 'assets', 'products')

# Ensure directories
os.makedirs(UPLOAD_DIR, exist_ok=True)

# MIME types
mimetypes.init()
mimetypes.add_type('application/javascript', '.js')
mimetypes.add_type('text/css', '.css')
mimetypes.add_type('image/svg+xml', '.svg')
mimetypes.add_type('image/png', '.png')
mimetypes.add_type('image/jpeg', '.jpg')
mimetypes.add_type('text/plain', '.txt')
mimetypes.add_type('application/json', '.json')

# --- DATABASE LOGIC ---

def init_db():
    if not os.path.exists(DB_FILE):
        print("Initializing data.json...")
        initial_data = {
            "admins": [],
            "visits": {"total": 0, "daily": {}},
            "settings": {}
        }

        # Migrate Admins
        if os.path.exists(AD_FILE):
            try:
                with open(AD_FILE, 'r', encoding='utf-8') as f:
                    lines = f.read().splitlines()
                
                # Parse in pairs or blocks
                # Simple parser assuming Username/Password lines
                current_user = {}
                for line in lines:
                    line = line.strip()
                    if not line: continue
                    if ':' in line:
                        key, val = line.split(':', 1)
                        key = key.strip().lower()
                        val = val.strip()
                        if key == 'username':
                            if 'username' in current_user and 'password' in current_user:
                                initial_data["admins"].append(current_user)
                                current_user = {}
                            current_user['username'] = val
                        elif key == 'password':
                            current_user['password'] = val
                
                if 'username' in current_user and 'password' in current_user:
                     initial_data["admins"].append(current_user)
                print(f"Migrated {len(initial_data['admins'])} admins.")
            except Exception as e:
                print(f"Migration Error (Admins): {e}")
        else:
             initial_data["admins"].append({"username": "admin", "password": "admin123"})

        # Migrate Visits
        if os.path.exists(VISITS_FILE):
            try:
                with open(VISITS_FILE, 'r', encoding='utf-8') as f:
                    vdata = json.load(f)
                    initial_data["visits"]["total"] = vdata.get("total", 0)
                    initial_data["visits"]["daily"] = vdata.get("daily", vdata.get("history", {}))
                print("Migrated visits.")
            except Exception as e:
                print(f"Migration Error (Visits): {e}")

        save_db(initial_data)

def load_db():
    if not os.path.exists(DB_FILE): init_db()
    with open(DB_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_db(data):
    with open(DB_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

# --- SERVER ---

class RequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS, PUT, DELETE')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-Filename')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        path = self.path.split('?')[0]
        
        if path == '/api/admins':
            self.send_json(load_db().get('admins', []))
            return
            
        if path == '/api/visits':
            self.send_json(load_db().get('visits', {}))
            return

        if path == '/api/settings':
             self.send_json(load_db().get('settings', {}))
             return
             
        # Router for HTML
        if path == '/admin' or path == '/admin/':
            self.path = '/admin.html'
        
        super().do_GET()

    def do_POST(self):
        path = self.path.split('?')[0]
        
        if path == '/api/upload-image': # Matches admin.js fetch
            self.handle_upload()
            return

        # JSON Handlers
        length = int(self.headers.get('Content-Length', 0))
        if length > 0:
            body = self.rfile.read(length).decode('utf-8')
            try:
                data = json.loads(body)
            except:
                data = {}
        else:
            data = {}

        if path == '/api/admins':
            db = load_db()
            if any(a['username'] == data.get('username') for a in db['admins']):
                self.send_error_json(400, "Admin exists")
                return
            db['admins'].append({"username": data['username'], "password": data['password']})
            save_db(db)
            self.send_json({"status": "success"})

        elif path == '/api/visits':
            db = load_db()
            today = datetime.now().strftime('%Y-%m-%d')
            db['visits']['total'] = db['visits'].get('total', 0) + 1
            if 'daily' not in db['visits']: db['visits']['daily'] = {}
            db['visits']['daily'][today] = db['visits']['daily'].get(today, 0) + 1
            save_db(db)
            self.send_json({"visits": db['visits']['total'], "today": db['visits']['daily'][today]})

        elif path == '/api/settings':
            db = load_db()
            db['settings'].update(data)
            save_db(db)
            # Legacy sync (optional)
            self.send_json({"status": "success"})
            
        else:
            self.send_error(404, "Not Found")

    def do_PUT(self):
        path = self.path.split('?')[0]
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length).decode('utf-8')
        data = json.loads(body)

        if path == '/api/admins':
            db = load_db()
            for admin in db['admins']:
                if admin['username'] == data.get('username'):
                    admin['password'] = data.get('newPassword')
                    save_db(db)
                    self.send_json({"status": "success"})
                    return
            self.send_error_json(404, "Admin not found")
        else:
             self.send_error(404)

    def do_DELETE(self):
        path = self.path.split('?')[0]
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length).decode('utf-8')
        data = json.loads(body)
        
        if path == '/api/admins':
            db = load_db()
            initial_len = len(db['admins'])
            db['admins'] = [a for a in db['admins'] if a['username'] != data.get('username')]
            
            if len(db['admins']) == initial_len:
                self.send_error_json(404, "Admin not found")
            else:
                save_db(db)
                self.send_json({"status": "success"})
        else:
            self.send_error(404)

    # --- HELPERS ---
    def send_json(self, data):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))

    def send_error_json(self, code, message):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({"error": message}).encode('utf-8'))

    def handle_upload(self):
         # Expecting raw binary or multipart. admin.js does `body: file` (raw binary).
         # Header X-Filename contains name.
         
         filename = self.headers.get('X-Filename')
         length = int(self.headers.get('Content-Length', 0))
         
         if filename:
             # Raw binary upload
             path = os.path.join(UPLOAD_DIR, filename)
             with open(path, 'wb') as f:
                 f.write(self.rfile.read(length))
             self.send_json({"status": "success", "filename": filename})
         else:
             # Fallback or Multipart (Complex)
             self.send_error_json(400, "X-Filename header missing (Binary upload required)")

# Start
init_db()

# Allow reuse of port to avoid "Address already in use"
socketserver.TCPServer.allow_reuse_address = True

print(f"Starting Python server on http://localhost:{PORT}")
print(f"Database: {DB_FILE}")

with socketserver.TCPServer(("", PORT), RequestHandler) as httpd:
    httpd.serve_forever()
