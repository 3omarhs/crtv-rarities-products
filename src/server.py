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
import urllib.parse
import sys
import csv
import io
import time
import base64

PORT = 8000
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
PUBLIC_DIR = os.path.join(PROJECT_ROOT, 'public')
ASSETS_DIR = os.path.join(PROJECT_ROOT, 'public', 'assets')
UPLOAD_DIR = os.path.join(ASSETS_DIR, 'products')

CONFIG_FILE = os.path.join(PROJECT_ROOT, 'config.json')
CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSTejg41yuaKcYa0CbOodUP9osmE5DIv8ZNQyMXhHJLLh2pQUZ5EoMT93UgV3LZfhAJcPEL8uEfK9Y4/pub?gid=897526080&single=true&output=csv"

try:
    os.makedirs(UPLOAD_DIR, exist_ok=True)
except Exception:
    pass

DATA_DIR = os.path.join(PROJECT_ROOT, 'data')

# --- GITHUB DAO ---
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
        # Always prepend 'data/' for github paths since Vercel requests only 'admins.csv'
        gh_path = f"data/{path}" if not path.startswith("data/") else path
        resp = self._request("GET", gh_path)
        if not resp:
            return [], None
        
        content_b64 = resp.get("content", "")
        sha = resp.get("sha")
        try:
            content_str = base64.b64decode(content_b64).decode('utf-8')
            if not content_str.strip():
                return [], sha
                
            reader = csv.DictReader(io.StringIO(content_str))
            return list(reader), sha
        except Exception as e:
            print(f"Error decoding/parsing CSV file {gh_path}: {e}")
            return [], sha

    def update_file(self, path, content_obj, message, sha=None):
        gh_path = f"data/{path}" if not path.startswith("data/") else path
        if not sha:
            _, existing_sha = self.get_file(gh_path)
            sha = existing_sha

        content_str = json.dumps(content_obj, indent=2)
        content_b64 = base64.b64encode(content_str.encode('utf-8')).decode('utf-8')
        
        data = { "message": message, "content": content_b64 }
        if sha: data["sha"] = sha
        return self._request("PUT", gh_path, data)

    def update_csv(self, path, list_of_dicts, message, sha=None):
        gh_path = f"data/{path}" if not path.startswith("data/") else path
        if not sha:
            _, existing_sha = self.get_csv(path)
            sha = existing_sha

        if not list_of_dicts:
            content_str = ""
        else:
            output = io.StringIO()
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
        return self._request("PUT", gh_path, data)

# --- UNIFIED DATA DAO ---
class UnifiedDAO:
    def __init__(self, data_dir, repo=None, token=None):
        self.data_dir = data_dir
        self.is_vercel = os.environ.get('VERCEL') == '1'
        self.github = None
        if self.is_vercel and repo and token:
            print("UnifiedDAO: Vercel detected, using GitHub persistence.")
            self.github = GitHubDAO(repo, token)
        else:
            print(f"UnifiedDAO: Using local persistence at {data_dir} (Vercel: {self.is_vercel})")
        os.makedirs(data_dir, exist_ok=True)

    def _get_path(self, path):
        filename = os.path.basename(path)
        return os.path.join(self.data_dir, filename)

    def get_csv(self, path):
        if self.github:
            data, _ = self.github.get_csv(path)
            return data
        
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

    def update_csv(self, path, list_of_dicts, message="Update from server"):
        if self.github:
            self.github.update_csv(path, list_of_dicts, message)
            return
            
        local_path = self._get_path(path)
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
# Configuration with Token
GITHUB_REPO = "3omarhs/crtv-rarities-products"
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "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")
local_db = UnifiedDAO(DATA_DIR, GITHUB_REPO, GITHUB_TOKEN)

# Removed legacy standalone github instantiation



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

def get_product_images(item_no):
    if not os.path.exists(UPLOAD_DIR): return []
    image_files = []
    files = os.listdir(UPLOAD_DIR)
    for f in files:
        if not f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp')): continue
        name, _ = os.path.splitext(f)
        if name == item_no or name.startswith(item_no + '_'):
            # Double check it matches strictly (item_no or item_no_123)
            if name == item_no:
                image_files.append(f"assets/products/{f}")
            elif name.startswith(item_no + '_'):
                suffix = name[len(item_no)+1:]
                if suffix.isdigit():
                    image_files.append(f"assets/products/{f}")
    return sorted(image_files)

def count_images_for_product(item_no):
    return len(get_product_images(item_no))

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

class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super(DecimalEncoder, self).default(obj)

class RequestHandler(http.server.SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.0"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

    def translate_path(self, path):
        """Map paths to PUBLIC_DIR or specific routes."""
        original_path = path
        path = path.split('?')[0]
        path = path.split('#')[0]
        
        print(f"Translating path: {original_path} -> {path}")

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
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-Filename')
        body = json.dumps(data, cls=DecimalEncoder).encode('utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()



    def do_GET(self):
        sys.stderr.write(f"[DEBUG] Received GET request for {self.path}\n")
        sys.stderr.flush()
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)
        
        if path.startswith('/api/'):
            # CORs pre-flight handled in do_OPTIONS usually, but here just setting headers
            
            if path == '/api/products':
                products_data = load_products()
                self.send_json(products_data)
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

            if path == '/api/visits':
                try:
                    visits = local_db.get_csv("visits.csv")
                    total = sum(int(v.get('count', 0)) for v in visits)
                    daily = {v.get('date'): int(v.get('count', 0)) for v in visits if v.get('date')}
                    
                    today = datetime.now().strftime('%Y-%m-%d')
                    today_count = next((int(v.get('count', 0)) for v in visits if v.get('date') == today), 0)
                    
                    self.send_json({
                        "total": total,
                        "daily": daily,
                        "today": today_count,
                        "visits": total # Compatibility
                    })
                except Exception as e:
                    print(f"Error fetching visits: {e}")
                    self.send_json({"total": 0, "daily": {}, "today": 0})
                return
            
            if path == '/api/index.py':
                self.send_json({
                    "self_path": self.path,
                    "headers": dict(self.headers),
                    "env_vercel": os.environ.get('VERCEL')
                })
                return

            elif path == '/api/orders':
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
                            raw_price = product.get('price_low_qty') or product.get('price') or 0
                            try:
                                offer_data["price"] = float(raw_price)
                            except:
                                offer_data["price"] = 0
                            offer_data["description"] = product.get('description')
                            # Dynamically get actual image paths
                            offer_data["images"] = get_product_images(item_no)
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
            sys.stderr.write(f"[DEBUG] Serving static file: {self.path}\n")
            sys.stderr.flush()
            super().do_GET()
        except Exception as e:
            sys.stderr.write(f"[DEBUG] Exception in do_GET: {e}\n")
            sys.stderr.flush()
            self.send_error_json(500, str(e))

    def do_POST(self):
        try:
            path = self.path.split('?')[0]
            print(f"[DEBUG] POST request to {path}")
                
            if path == '/api/upload-image':
                self.handle_upload()
                return

            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length).decode('utf-8')
            try:
                data = json.loads(body)
            except:
                data = {}
            
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
    
            elif path == '/api/place-order' or path == '/api/orders':
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

            elif path == '/api/update-order-status':
                order_id = data.get('orderId')
                new_status = data.get('status')
                if not order_id or not new_status:
                    self.send_error_json(400, "Missing orderId or status")
                    return
                
                orders = local_db.get_csv("orders.csv")
                updated = False
                for o in orders:
                    # 'id' in orders.csv is typically stored as a string or a number, converting both to str for safe comparison
                    if str(o.get('id', '')) == str(order_id):
                        o['status'] = new_status
                        updated = True
                        break
                
                if updated:
                    local_db.update_csv("orders.csv", orders)
                    self.send_json({"status": "success"})
                else:
                    self.send_error_json(404, "Order not found")
                return

            elif path == '/api/add-product':
                # Sync new product from Admin to local CSV
                products = local_db.get_csv("products.csv")
                
                # Check if exists (by item_no)
                item_no = data.get('item_no') or data.get('No')
                if not item_no:
                     self.send_error_json(400, "Item Number (No) is required")
                     return
    
                # Map fields if necessary (admin.js sends 'No', 'product name' etc)
                # Unified keys for server mapping to products.csv headers
                new_p = {
                    "item_no": item_no,
                    "name": data.get('product name'),
                    "store_name": data.get('Name on Store'),
                    "arabic_name": data.get('Arabic Name'),
                    "category": data.get('category'),
                    "collection": data.get('collection'),
                    "target_market": data.get('target market'),
                    "dimensions": data.get('Dimensions(mm) x y z'),
                    "description": data.get('description (80 word)'),
                    "price_low_qty": data.get('Price < 25 QTY'),
                    "price_high_qty": data.get('Price >= 25 QTY'),
                    "document_link": data.get('Document Link'),
                    "calc_val": data.get('Calculate on Weight'),
                    "available": data.get('Available', 'TRUE'),
                    "hidden": data.get('Hidden', 'FALSE'),
                    "colors": data.get('Colors'),
                    "image_count": data.get('image_count', 1),
                    "id": data.get('id') or int(float(time.time()) * 1000)
                }
    
                # Update if exists, else append
                found = False
                for i, p in enumerate(products):
                    if str(p.get('item_no')) == str(item_no):
                        # Preserve existing ID if updating
                        if 'id' in products[i] and not data.get('id'):
                            new_p['id'] = products[i]['id']
                        products[i].update(new_p)
                        found = True
                        break
                if not found:
                    products.append(new_p)
                
                local_db.update_csv("products.csv", products)
                self.send_json({"status": "success", "item_no": item_no})
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

        except Exception as e:
            print(f"[ERROR] POST {self.path} failed: {traceback.format_exc()}")
            self.send_error_json(500, str(e))

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
            
            if found:
                local_db.update_csv("wholesale.csv", offers)
                self.send_json({"status": "success"})
            else:
                self.send_error_json(404, "Wholesale item not found")
            return

        self.send_error(404)

    def do_DELETE(self):
        try:
            path = self.path.split('?')[0].rstrip('/')
            sys.stderr.write(f"[DEBUG] DELETE request to {path}\n")
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length).decode('utf-8')
            try:
                data = json.loads(body) if body else {}
            except json.JSONDecodeError:
                data = {}

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

            elif path == '/api/orders':
                order_id = data.get('orderId')
                orders = local_db.get_csv("orders.csv")
                new_orders = [o for o in orders if str(o.get('id', '')) != str(order_id)]
                if len(new_orders) < len(orders):
                    local_db.update_csv("orders.csv", new_orders)
                    self.send_json({"status": "success"})
                else:
                    self.send_error_json(404, "Order not found")
                return
                
            self.send_error(404)
        except Exception as e:
            print(f"[ERROR] DELETE {self.path} failed: {traceback.format_exc()}")
            self.send_error_json(500, str(e))

    # --- HELPERS ---
    # --- HELPERS ---


    def send_error_json(self, code, message):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({"error": message}).encode('utf-8'))

    def handle_upload(self):
         try:
             filename = self.headers.get('X-Filename')
             length = int(self.headers.get('Content-Length', 0))
             print(f"[DEBUG] Handling upload for {filename} (Internal: {length} bytes)")
             
             if filename:
                 # Sanitize filename
                 filename = os.path.basename(filename)
                 path = os.path.join(UPLOAD_DIR, filename)
                 print(f"[DEBUG] Saving to {path}")
                 
                 with open(path, 'wb') as f:
                     f.write(self.rfile.read(length))
                 
                 print(f"[DEBUG] Upload successful: {filename}")
                 self.send_json({"status": "success", "filename": filename})
             else:
                 print("[ERROR] X-Filename missing in headers")
                 self.send_error_json(400, "X-Filename header missing")
         except Exception as e:
             print(f"[ERROR] handle_upload failed: {traceback.format_exc()}")
             self.send_error_json(500, str(e))

# Start

# Allow reuse of port

class ThreadingTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    pass

if __name__ == "__main__":
    import socket
    socketserver.TCPServer.allow_reuse_address = True
    print(f"Starting Python server on http://localhost:{PORT}")
    print(f"Project Root: {PROJECT_ROOT}")
    print(f"Public Dir: {PUBLIC_DIR}")
    print(f"Config: {CONFIG_FILE}")

    with ThreadingTCPServer(("", PORT), RequestHandler) as httpd:
        print("[DEBUG] Server binding successful, entering serve_forever")
        httpd.serve_forever()
