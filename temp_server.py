import http.server
import socketserver
import os
import json
import mimetypes
# import sqlite3
# import pyodbc
from datetime import datetime
import traceback
from decimal import Decimal
import urllib.request
import csv
import io
import time
import base64

# --- GITHUB DAO ---

PORT = 8000
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
PUBLIC_DIR = os.path.join(PROJECT_ROOT, 'public')
ASSETS_DIR = os.path.join(PROJECT_ROOT, 'assets')
UPLOAD_DIR = os.path.join(ASSETS_DIR, 'products')

CONFIG_FILE = os.path.join(PROJECT_ROOT, 'config.json')
CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSTejg41yuaKcYa0CbOodUP9osmE5DIv8ZNQyMXhHJLLh2pQUZ5EoMT93UgV3LZfhAJcPEL8uEfK9Y4/pub?gid=897526080&single=true&output=csv"

# Ensure directories exist
os.makedirs(UPLOAD_DIR, exist_ok=True)
# --- LOCAL DATA DAO ---

class LocalDataDAO:
    def __init__(self, data_dir):
        self.data_dir = data_dir
        os.makedirs(data_dir, exist_ok=True)

    def _get_path(self, path):
        # Extract filename if full path like 'data/file.csv' is passed
        filename = os.path.basename(path)
        return os.path.join(self.data_dir, filename)

    def get_csv(self, path):
        """Returns list of dicts."""
        local_path = self._get_path(path)
        if not os.path.exists(local_path):
            return []
        
        try:
            with open(local_path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                return list(reader)
        except Exception as e:
            print(f"Error reading local CSV {local_path}: {e}")
            return []

    def update_csv(self, path, list_of_dicts, message=None):
        """Updates a local CSV file."""
        local_path = self._get_path(path)
        if not list_of_dicts:
            with open(local_path, 'w', encoding='utf-8') as f:
                f.write("")
            return

        try:
            fieldnames = set()
            for row in list_of_dicts:
                fieldnames.update(row.keys())
            fieldnames = sorted(list(fieldnames))
            
            with open(local_path, 'w', encoding='utf-8', newline='') as f:
                writer = csv.DictWriter(f, fieldnames=fieldnames)
                writer.writeheader()
                writer.writerows(list_of_dicts)
        except Exception as e:
            print(f"Error writing local CSV {local_path}: {e}")
            raise

DATA_DIR = os.path.join(PROJECT_ROOT, 'data')
local_db = LocalDataDAO(DATA_DIR)

# --- GitHub DAO (Legacy/Fallback) ---
class GitHubDAO:
    def __init__(self, repo, token):
        self.repo = repo
        self.token = token
        self.base_url = f"https://api.github.com/repos/{repo}/contents"

    def _request(self, method, path, data=None):
        url = f"{self.base_url}/{path}"
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Accept": "application/vnd.github.v3+json",
            "Content-Type": "application/json"
        }
        
        req = urllib.request.Request(url, headers=headers, method=method)
        if data:
            req.data = json.dumps(data).encode('utf-8')
            
        try:
            with urllib.request.urlopen(req, timeout=10) as response:
                return json.loads(response.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            print(f"GitHub API Error {e.code}: {e.read().decode('utf-8')}")
            raise

    def get_file(self, path):
        """Returns (content_obj, sha). Content is JSON parsed."""
        resp = self._request("GET", path)
        if not resp:
            return None, None
        
        content_b64 = resp.get("content", "")
        sha = resp.get("sha")
        try:
            content_str = base64.b64decode(content_b64).decode('utf-8')
            return json.loads(content_str), sha
        except Exception as e:
            print(f"Error decoding/parsing file {path}: {e}")
            return None, sha

    def get_csv(self, path):
        """Returns (list_of_dicts, sha). Content is CSV parsed."""
        resp = self._request("GET", path)
        if not resp:
            return [], None # Return empty list if not found
        
        content_b64 = resp.get("content", "")
        sha = resp.get("sha")
        try:
            content_str = base64.b64decode(content_b64).decode('utf-8')
            # Handle empty file
            if not content_str.strip():
                return [], sha
                
            reader = csv.DictReader(io.StringIO(content_str))
            return list(reader), sha
        except Exception as e:
            print(f"Error decoding/parsing CSV file {path}: {e}")
            return [], sha

    def update_file(self, path, content_obj, message, sha=None):
        """Updates a JSON file."""
        if not sha:
            _, existing_sha = self.get_file(path)
            sha = existing_sha

        content_str = json.dumps(content_obj, indent=2)
        content_b64 = base64.b64encode(content_str.encode('utf-8')).decode('utf-8')
        
        data = { "message": message, "content": content_b64 }
        if sha: data["sha"] = sha
        return self._request("PUT", path, data)

    def update_csv(self, path, list_of_dicts, message, sha=None):
        """Updates a CSV file."""
        if not sha:
            _, existing_sha = self.get_csv(path)
            sha = existing_sha

        if not list_of_dicts:
            content_str = ""
        else:
            output = io.StringIO()
            # Normalize keys from first dictionary or union of keys? 
            # For simplicity, use keys from first item if available, or just standard ones if known.
            # But specific endpoints might add fields. Let's find all unique keys.
            fieldnames = set()
            for row in list_of_dicts:
                fieldnames.update(row.keys())
            fieldnames = sorted(list(fieldnames))
            
            writer = csv.DictWriter(output, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(list_of_dicts)
            content_str = output.getvalue()

        content_b64 = base64.b64encode(content_str.encode('utf-8')).decode('utf-8')
        data = { "message": message, "content": content_b64 }
        if sha: data["sha"] = sha
        return self._request("PUT", path, data)


# Configuration with Token
GITHUB_REPO = "3omarhs/crtv-rarities-products"
# Use env var if available, else use the hardcoded one provided by user
# (In production/Vercel, user should set GITHUB_TOKEN env var)
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "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")
github = GitHubDAO(GITHUB_REPO, GITHUB_TOKEN)


# --- SHARED FUNCTIONS ---

def load_products():
    """Load products from local CSV."""
    try:
        products = local_db.get_csv("products.csv")
        return products
    except:
        return []

def get_product_by_no(item_no, products_list=None):
    if not products_list:
        products_list = load_products()
    for p in products_list:
        if str(p.get('item_no')) == str(item_no):
            return p
    return None

def count_images_for_product(item_no):
    if not os.path.exists(UPLOAD_DIR): return 0
    count = 0
    # Pattern: item_no.ext or item_no_X.ext
    # Simple check: startswith item_no + '_' or == item_no + '.'
    # Be careful with partial matches e.g. "123" matching "1234"
    
    files = os.listdir(UPLOAD_DIR)
    for f in files:
        if not f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp')): continue
        name, _ = os.path.splitext(f)
        if name == item_no:
            count += 1
        elif name.startswith(item_no + '_'):
            # check if rest is number
             suffix = name[len(item_no)+1:]
             if suffix.isdigit():
                 count += 1
    return count

def sync_products_from_sheet():
    print("Syncing products from Google Sheet to GitHub...")
    try:
        csv.field_size_limit(10 * 1024 * 1024)
        with urllib.request.urlopen(CSV_URL) as response:
            content = response.read().decode('utf-8')
        
        csv_reader = csv.DictReader(io.StringIO(content))
        
        # Helper to safely get value
        def g(row, candidates):
            for cand in candidates:
                if cand in row: return row[cand]
            row_keys_normalized = {k.lower().strip(): k for k in row.keys()}
            for cand in candidates:
                cand_norm = cand.lower().strip()
                if cand_norm in row_keys_normalized:
                    return row[row_keys_normalized[cand_norm]]
                for rk, real_key in row_keys_normalized.items():
                    if cand_norm in rk:
                        return row[real_key]
            return None

        products = []
        for row in csv_reader:
            item_no = g(row, ['No', 'Item Number', 'Number', 'id'])
            name = g(row, ['Product Name', 'Name', 'Title'])
            
            if not item_no or not name: continue
            
            img_count = count_images_for_product(item_no)
            
            p = {
                "item_no": item_no,
                "name": name,
                "category": g(row, ['Category']),
                "collection": g(row, ['Collection']),
                "target_market": g(row, ['Target Market']),
                "weight_calc": g(row, ['Weight', 'Calculate on Weight']),
                "dimensions": g(row, ['Dimensions', 'Dimensions(mm) x y z']),
                "description": g(row, ['Description', 'description (80 word)']),
                "price_low_qty": g(row, ['Price < 25', 'Price < 25 QTY']),
                "price_high_qty": g(row, ['Price >= 25', 'Price >=25 QTY']),
                "discount_cal": g(row, ['Discount Cal', 'discount cal']),
                "document_link": g(row, ['Document Link', 'Link']),
                "discount_percent": g(row, ['Discount %']),
                "calc_val": g(row, ['Calc', 'calc_val', 'calc']),
                "store_name": g(row, ['Store Name', 'Name on Store']),
                "arabic_name": g(row, ['Arabic Name']),
                "available": g(row, ['Available']),
                "hidden": g(row, ['Hidden']),
                "colors": g(row, ['Colors']),
                "image_count": img_count,
                "id": int(float(time.time()) * 1000) # Regenerating ID? Maybe keep stable if possible. Use Hash? 
                # For now random is fine if we replace full list.
            }
            products.append(p)
            
        # Update GitHub
        # We replace the whole products.json with sheet data
        # Update local storage
        try:
             local_db.update_csv("products.csv", products)
             print(f"Synced {len(products)} products to local data/products.csv")
        except Exception as e:
             print(f"Failed to update local products: {e}")

    except Exception as e:
        print(f"Failed to sync products from sheet: {e}")

class RequestHandler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        """Map paths to PUBLIC_DIR or specific routes."""
        original_path = path
        path = path.split('?')[0]
        path = path.split('#')[0]
        
        print(f"Translating path: {original_path} -> {path}")

        # Explicit assets route
        if path.startswith('/assets/'):
             # Map /assets/... to PROJECT_ROOT/assets/...
             clean_path = path.replace('/assets/', '', 1)
             res = os.path.join(ASSETS_DIR, clean_path)
             print(f" -> Assets Path: {res}")
             return res
             
        # Normalize
        path = os.path.normpath(urllib.request.url2pathname(path))
        words = path.split(os.sep)
        words = filter(None, words)
        
        target_path = PUBLIC_DIR
        for word in words:
            if os.path.dirname(word) or word in (os.curdir, os.pardir):
                continue
            target_path = os.path.join(target_path, word)
            
        print(f" -> Public Path: {target_path}")
        return target_path

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS, PUT, DELETE')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-Filename')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()

    def send_json(self, data):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        
        class DecimalEncoder(json.JSONEncoder):
            def default(self, obj):
                if isinstance(obj, Decimal):
                    return float(obj)
                return super(DecimalEncoder, self).default(obj)
                
        self.wfile.write(json.dumps(data, cls=DecimalEncoder).encode('utf-8'))

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def send_json(self, data):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)
        
        if path.startswith('/api/'):
            # CORs pre-flight handled in do_OPTIONS usually, but here just setting headers
            
            if path == '/api/products':
                products_data = load_products()
                self.send_json(products_data)
                return
            
            if path == '/api/visits':
                try:
                    visits_list = local_db.get_csv("visits.csv")
                    # Calculate stats
                    total = 0
                    today = 0
                    today_str = datetime.now().strftime('%Y-%m-%d')
                    
                    for row in visits_list:
                        c = int(row.get('count', 0))
                        total += c
                        if row.get('date') == today_str:
                            today += c
                            
                    self.send_json({"visits": total, "today": today})
                except Exception as e:
                    self.send_json({"visits": 0, "today": 0})
                return
            
            if path == '/api/settings':
                try:
                    settings_list = local_db.get_csv("settings.csv")
                    settings_dict = {row.get('key'): row.get('value') for row in settings_list}
                    self.send_json(settings_dict)
                except:
                    self.send_json({})
                return
            
            if path == '/api/admins':
                try:
                    admins_list = local_db.get_csv("admins.csv")
                    self.send_json(admins_list)
                except:
                    self.send_json([])
                return

            if path == '/api/gemini-keys':
                try:
                    # Priority: gemini_keys.csv -> keys.csv
                    keys = []
                    keys_list = local_db.get_csv("gemini_keys.csv")
                    if not keys_list:
                         keys_list = local_db.get_csv("keys.csv")
                    
                    keys = [k.get('key') for k in keys_list if k.get('key') and k.get('key').strip()]
                    
                    self.send_json({"keys": keys})
                except Exception as e:
                    print(f"Error fetching Gemini keys: {e}")
                    self.send_json({"keys": []})
                return
            
            if path == '/api/orders':
                try:
                    orders = local_db.get_csv("orders.csv")
                    # Parse items JSON string back to list if needed, or frontend handles it?
                    # CSVReader returns strings. If 'items' is a JSON string, frontend needs to parse it.
                    # Server acts as proxy: receives JSON -> converts complex fields to string -> CSV.
                    # Reads CSV -> converts string fields back to JSON -> Sends JSON.
                    for o in orders:
                        if 'items' in o and o['items'].startswith('['):
                            try:
                                o['items'] = json.loads(o['items'])
                            except: pass
                        if 'customer' in o and o['customer'].startswith('{'):
                             try:
                                o['customer'] = json.loads(o['customer'])
                             except: pass

                    self.send_json(orders)
                except Exception as e:
                    self.send_error_json(500, str(e))
                return

            if path == '/api/special-offers':
                try:
                    offers = local_db.get_csv("wholesale.csv")
                    products = load_products()
                    
                    enriched_offers = []
                    for offer in offers:
                        item_no = offer.get('item_no')
                        product = get_product_by_no(item_no, products)
                        
                        offer_data = {
                            "id": offer.get('id'),
                            "item_no": item_no,
                            "special_price": offer.get('special_price'),
                            "category": offer.get('category'),
                            "name": "Unknown",
                            "price": 0,
                            "description": "",
                            "image_paths": []
                        }
                        if product:
                            offer_data["name"] = product.get('name')
                            offer_data["price"] = product.get('price')
                            offer_data["description"] = product.get('description')
                            img_count = product.get('image_count')
                            if img_count:
                                try:
                                    count = int(img_count)
                                    offer_data["image_paths"] = [f"assets/products/{item_no}_{i+1}.jpg" for i in range(count)]
                                except: pass
                        enriched_offers.append(offer_data)

                    self.send_json(enriched_offers)
                    return
                except Exception as e:
                    self.send_error_json(500, str(e))
                return
            
            self.send_error_json(404, "Endpoint not found")
            return

        try:
            if path == '/admin' or path == '/admin/':
                self.path = '/admin.html'
            super().do_GET()
        except Exception as e:
            self.send_error_json(500, str(e))

    def do_POST(self):
        path = self.path.split('?')[0]
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length).decode('utf-8')
        try:
            data = json.loads(body)
        except:
            data = {}
            
        if path == '/api/upload-image':
            # This is multipart, handled differently usually. 
            # Current implementation of handle_upload uses headers X-Filename.
            self.handle_upload()
            return

        if path == '/api/sync-sheet':
             sync_products_from_sheet()
             self.send_json({"status": "synced"})
             return

        # CSV Data Handlers
        if path == '/api/admins':
            # Create Admin
            username = data.get('username')
            password = data.get('password')
            
            admins = local_db.get_csv("admins.csv")
            if any(a.get('username') == username for a in admins):
                self.send_error_json(400, "Username exists")
                return
            
            admins.append({"username": username, "password": password, "created_at": datetime.now().isoformat()})
            local_db.update_csv("admins.csv", admins)
            self.send_json({"status": "success"})
            return

        elif path == '/api/settings':
            settings = local_db.get_csv("settings.csv")
            
            # Support both batch ({key: val, ...}) and single ({key: 'k', value: 'v'})
            updates = {}
            if 'key' in data and 'value' in data:
                updates[data['key']] = data['value']
            else:
                updates = data
                
            for key, value in updates.items():
                found = False
                for s in settings:
                    if s.get('key') == key:
                        s['value'] = value
                        found = True
                        break
                if not found:
                    settings.append({"key": key, "value": value})
            
            local_db.update_csv("settings.csv", settings)
            self.send_json({"status": "success"})
            return

        elif path == '/api/visits':
            today = datetime.now().strftime('%Y-%m-%d')
            visits = local_db.get_csv("visits.csv")
            
            found = False
            for v in visits:
                if v.get('date') == today:
                    v['count'] = int(v.get('count', 0)) + 1
                    found = True
                    break
            if not found:
                visits.append({"date": today, "count": 1})
            
            local_db.update_csv("visits.csv", visits)
            self.send_json({"status": "success"})
            return

        elif path == '/api/place-order':
            order_data = data
            orders = local_db.get_csv("orders.csv")
            
            # Convert complex fields to JSON strings for CSV storage
            if 'items' in order_data:
                order_data['items'] = json.dumps(order_data['items'])
            if 'customer' in order_data:
                order_data['customer'] = json.dumps(order_data['customer'])
                
            orders.append(order_data)
            local_db.update_csv("orders.csv", orders)
            self.send_json({"status": "success"})
            return

        elif path == '/api/special-offers':
            item_no = data.get('item_no')
            special_price = data.get('special_price')
            category = data.get('category')
            
            offers = local_db.get_csv("wholesale.csv")
            
            found = False
            for o in offers:
                if str(o.get('item_no')) == str(item_no):
                    o['special_price'] = special_price
                    o['category'] = category
                    o['updated_at'] = datetime.now().isoformat()
                    found = True
                    break
            
            if not found:
                offers.append({
                    "id": int(float(time.time())),
                    "item_no": item_no,
                    "special_price": special_price,
                    "category": category,
                    "updated_at": datetime.now().isoformat()
                })
            
            local_db.update_csv("wholesale.csv", offers)
            self.send_json({"status": "success"})
            return

        self.send_error(404)

    def do_PUT(self):
        # Similar logic for PUT (Update Admin)
        path = self.path.split('?')[0]
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length).decode('utf-8')
        data = json.loads(body)

        if path == '/api/admins':
            username = data.get('username')
            new_password = data.get('newPassword')
            
            admins = local_db.get_csv("admins.csv")
            for a in admins:
                if a.get('username') == username:
                    a['password'] = new_password
                    local_db.update_csv("admins.csv", admins)
                    self.send_json({"status": "success"})
                    return
            self.send_error_json(404, "Admin not found")
            return
        self.send_error(404)

    def do_DELETE(self):
        path = self.path.split('?')[0]
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length).decode('utf-8')
        data = json.loads(body)

        if path == '/api/admins':
            username = data.get('username')
            admins = local_db.get_csv("admins.csv")
            new_admins = [a for a in admins if a.get('username') != username]
            if len(new_admins) < len(admins):
                local_db.update_csv("admins.csv", new_admins)
            self.send_json({"status": "success"})
            return

        elif path == '/api/special-offers':
            item_no = data.get('item_no')
            offers = local_db.get_csv("wholesale.csv")
            new_offers = [o for o in offers if str(o.get('item_no')) != str(item_no)]
            if len(new_offers) < len(offers):
                local_db.update_csv("wholesale.csv", new_offers)
            self.send_json({"status": "success"})
            return
            
        self.send_error(404)



    # --- HELPERS ---
    # --- HELPERS ---


    def send_error_json(self, code, message):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({"error": message}).encode('utf-8'))

    def handle_upload(self):
         filename = self.headers.get('X-Filename')
         length = int(self.headers.get('Content-Length', 0))
         
         if filename:
             path = os.path.join(UPLOAD_DIR, filename)
             with open(path, 'wb') as f:
                 f.write(self.rfile.read(length))
             self.send_json({"status": "success", "filename": filename})
         else:
             self.send_error_json(400, "X-Filename header missing")

# Start

# Allow reuse of port

class ThreadingTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    pass

# Allow reuse of port
socketserver.TCPServer.allow_reuse_address = True

print(f"Starting Python server on http://localhost:{PORT}")
print(f"Project Root: {PROJECT_ROOT}")
print(f"Public Dir: {PUBLIC_DIR}")

print(f"Config: {CONFIG_FILE}")

with ThreadingTCPServer(("", PORT), RequestHandler) as httpd:
    httpd.serve_forever()
