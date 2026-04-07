
import os

SERVER_FILE = 'src/server.py'

NEW_GITHUB_DAO = r'''class GitHubDAO:
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
            with urllib.request.urlopen(req) as response:
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
'''

# We also need to add send_json to RequestHandler and update endpoints.
# This replacement is safer done by rewriting the whole file or large chunks.
# Given the size, let's Replace the Class `GitHubDAO` first, then replace `RequestHandler` methods.

# Read file
with open(SERVER_FILE, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace GitHubDAO class
start_marker = "class GitHubDAO:"
end_marker = "# Configuration with Token"
start_idx = content.find(start_marker)
end_idx = content.find(end_marker)

if start_idx != -1 and end_idx != -1:
    content = content[:start_idx] + NEW_GITHUB_DAO + "\n\n" + content[end_idx:]
    print("Updated GitHubDAO")

# Replace RequestHandler methods to use CSV and add send_json
# This is complex to regex replace. I will construct the new RequestHandler methods string.
# Key changes:
# 1. /api/products -> stays JSON (synced from CSV)
# 2. /api/visits -> data/visits.csv
# 3. /api/settings -> data/settings.csv
# 4. /api/admins -> data/admins.csv
# 5. /api/orders -> data/orders.csv
# 6. /api/special-offers -> data/wholesale.csv

NEW_METHODS_PART_1 = r'''    def send_json(self, data):
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
                    visits_list, _ = github.get_csv("data/visits.csv")
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
                    settings_list, _ = github.get_csv("data/settings.csv")
                    settings_dict = {row.get('key'): row.get('value') for row in settings_list}
                    self.send_json(settings_dict)
                except:
                    self.send_json({})
                return
            
            if path == '/api/admins':
                try:
                    admins_list, _ = github.get_csv("data/admins.csv")
                    self.send_json(admins_list)
                except:
                    self.send_json([])
                return
            
            if path == '/api/orders':
                try:
                    orders, _ = github.get_csv("data/orders.csv")
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
                    offers, _ = github.get_csv("data/wholesale.csv")
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
            
            admins, sha = github.get_csv("data/admins.csv")
            if any(a.get('username') == username for a in admins):
                self.send_error_json(400, "Username exists")
                return
            
            admins.append({"username": username, "password": password, "created_at": datetime.now().isoformat()})
            github.update_csv("data/admins.csv", admins, f"Add Admin {username}", sha)
            self.send_json({"status": "success"})
            return

        elif path == '/api/settings':
            key = data.get('key')
            value = data.get('value')
            
            settings, sha = github.get_csv("data/settings.csv")
            
            # Find and update
            found = False
            for s in settings:
                if s.get('key') == key:
                    s['value'] = value
                    found = True
                    break
            if not found:
                settings.append({"key": key, "value": value})
            
            github.update_csv("data/settings.csv", settings, f"Update Setting {key}", sha)
            self.send_json({"status": "success"})
            return

        elif path == '/api/visits':
            today = datetime.now().strftime('%Y-%m-%d')
            visits, sha = github.get_csv("data/visits.csv")
            
            found = False
            for v in visits:
                if v.get('date') == today:
                    v['count'] = int(v.get('count', 0)) + 1
                    found = True
                    break
            if not found:
                visits.append({"date": today, "count": 1})
            
            github.update_csv("data/visits.csv", visits, f"Visit {today}", sha)
            self.send_json({"status": "success"})
            return

        elif path == '/api/place-order':
            order_data = data
            orders, sha = github.get_csv("data/orders.csv")
            
            # Convert complex fields to JSON strings for CSV storage
            # order_data usually has 'items' (list) and 'customer' (dict)
            if 'items' in order_data:
                order_data['items'] = json.dumps(order_data['items'])
            if 'customer' in order_data:
                order_data['customer'] = json.dumps(order_data['customer'])
                
            orders.append(order_data)
            github.update_csv("data/orders.csv", orders, f"Add Order {order_data.get('id', 'new')}", sha)
            self.send_json({"status": "success"})
            return

        elif path == '/api/special-offers':
            item_no = data.get('item_no')
            special_price = data.get('special_price')
            category = data.get('category')
            
            offers, sha = github.get_csv("data/wholesale.csv")
            
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
            
            github.update_csv("data/wholesale.csv", offers, f"Update Wholesale {item_no}", sha)
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
            
            admins, sha = github.get_csv("data/admins.csv")
            for a in admins:
                if a.get('username') == username:
                    a['password'] = new_password
                    github.update_csv("data/admins.csv", admins, f"Update Admin {username}", sha)
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
            admins, sha = github.get_csv("data/admins.csv")
            new_admins = [a for a in admins if a.get('username') != username]
            if len(new_admins) < len(admins):
                github.update_csv("data/admins.csv", new_admins, f"Delete Admin {username}", sha)
            self.send_json({"status": "success"})
            return

        elif path == '/api/special-offers':
            item_no = data.get('item_no')
            offers, sha = github.get_csv("data/wholesale.csv")
            new_offers = [o for o in offers if str(o.get('item_no')) != str(item_no)]
            if len(new_offers) < len(offers):
                github.update_csv("data/wholesale.csv", new_offers, f"Delete Wholesale {item_no}", sha)
            self.send_json({"status": "success"})
            return
            
        self.send_error(404)

'''

# Replacing do_GET, do_POST, do_PUT, do_DELETE
# Finding the block
start_handler = "    def do_GET(self):"
end_handler = "    # --- HELPERS ---"
start_idx_h = content.find(start_handler)
end_idx_h = content.find(end_handler)

if start_idx_h != -1 and end_idx_h != -1:
    content = content[:start_idx_h] + NEW_METHODS_PART_1 + "\n\n" + content[end_idx_h:]
    print("Updated RequestHandler methods")

with open(SERVER_FILE, 'w', encoding='utf-8') as f:
    f.write(content)
