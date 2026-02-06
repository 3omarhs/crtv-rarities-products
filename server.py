import http.server
import socketserver
import os
import json
import mimetypes
import sqlite3
import pyodbc
from datetime import datetime

PORT = 8000
BASE_DIR = os.getcwd()
DB_FILE = os.path.join(BASE_DIR, 'database.db')
CONFIG_FILE = os.path.join(BASE_DIR, 'db_config.json')
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

# --- DATABASE ABSTRACTION ---

def get_config():
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, 'r') as f:
            return json.load(f)
    return {"use_sql_server": False}

def get_db_connection():
    config = get_config()
    
    if config.get("use_sql_server", False):
        # MSSQL Connection
        conn_str = config.get("connection_string", "")
        if not conn_str:
            raise ValueError("MSSQL enabled but connection_string is empty in db_config.json")
        try:
            conn = pyodbc.connect(conn_str)
            return conn, "mssql"
        except Exception as e:
            print(f"Error connecting to SQL Server: {e}")
            raise
    else:
        # SQLite Connection
        conn = sqlite3.connect(DB_FILE)
        conn.row_factory = sqlite3.Row
        return conn, "sqlite"

def execute_query(query, params=(), fetch=False, commit=False):
    conn, db_type = get_db_connection()
    cursor = conn.cursor()
    
    # Adjust placeholders if needed
    # SQLite uses ?, pyodbc uses ? usually. 
    # T-SQL parameters are standard ? in pyodbc.
    
    # Handle reserved word escaping for different DBs if necessary
    # Assuming simple queries for now.
    
    try:
        cursor.execute(query, params)
        if commit:
            conn.commit()
        
        result = None
        if fetch:
            columns = [column[0] for column in cursor.description]
            rows = cursor.fetchall()
            # Convert to list of dicts for consistency
            result = [dict(zip(columns, row)) for row in rows]
            
        return result
    finally:
        conn.close()

def init_db():
    config = get_config()
    if config.get("use_sql_server", False):
        print("Using SQL Server. Assuming schema exists (Use db_schema.sql to create it).")
        return # Skip auto-init for MSSQL, usually handled by DBA/Script

    # Local SQLite Init
    print("Using Local SQLite.")
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    
    c.execute('''CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )''')
    
    c.execute('''CREATE TABLE IF NOT EXISTS visits (
        date TEXT PRIMARY KEY,
        count INTEGER DEFAULT 0
    )''')
    
    c.execute('''CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )''')
    
    conn.commit()
    conn.close()

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
        
        try:
            if path == '/api/admins':
                admins = execute_query('SELECT username, password FROM admins', fetch=True)
                self.send_json(admins)
                return
                
            if path == '/api/visits':
                # Generic SQL should work for both
                total_res = execute_query('SELECT SUM(count) as t FROM visits', fetch=True)
                total = total_res[0]['t'] if total_res and total_res[0]['t'] else 0
                
                daily_res = execute_query('SELECT date, count FROM visits', fetch=True)
                daily = {row['date']: row['count'] for row in daily_res}
                
                self.send_json({"visits": {"total": total, "daily": daily}})
                return

            if path == '/api/settings':
                 rows = execute_query('SELECT key, value FROM settings', fetch=True)
                 settings = {row['key']: row['value'] for row in rows}
                 self.send_json(settings)
                 return

            if path == '/api/products':
                # Map DB columns back to CSV headers for frontend compatibility
                query = '''
                    SELECT 
                        item_no as "No",
                        name as "Product Name",
                        category,
                        collection,
                        target_market as "target market",
                        weight_calc as "Calculate on Weight",
                        dimensions as "Dimensions(mm) x y z",
                        description as "description (80 word)",
                        price_low_qty as "Price < 25 QTY",
                        price_high_qty as "Price >=25 QTY",
                        discount_cal as "discount cal",
                        document_link as "Document Link",
                        discount_percent as "Discount %",
                        calc_val as "calc",
                        store_name as "Name on Store",
                        arabic_name as "Arabic Name",
                        available as "Available",
                        hidden as "Hidden",
                        colors as "Colors"
                    FROM products
                '''
                products = execute_query(query, fetch=True)
                self.send_json(products)
                return

                 
            # Router for HTML
            if path == '/admin' or path == '/admin/':
                self.path = '/admin.html'
            
            super().do_GET()
        except Exception as e:
            print(f"Server Error: {e}")
            self.send_error_json(500, str(e))

    def do_POST(self):
        path = self.path.split('?')[0]
        
        if path == '/api/upload-image': 
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

        try:
            if path == '/api/admins':
                username = data.get('username')
                password = data.get('password')
                if not username or not password:
                    self.send_error_json(400, "Missing credentials")
                    return
                    
                # Check exist
                existing = execute_query('SELECT username FROM admins WHERE username = ?', (username,), fetch=True)
                if existing:
                    self.send_error_json(400, "Admin exists")
                    return

                execute_query('INSERT INTO admins (username, password) VALUES (?, ?)', (username, password), commit=True)
                self.send_json({"status": "success"})
                return

            elif path == '/api/visits':
                today = datetime.now().strftime('%Y-%m-%d')
                
                conn, db_type = get_db_connection()
                try:
                    if db_type == 'sqlite':
                        conn.execute('''
                            INSERT INTO visits (date, count) VALUES (?, 1)
                            ON CONFLICT(date) DO UPDATE SET count = count + 1
                        ''', (today,))
                    else:
                        # MSSQL Upsert (Merge or check exist)
                        # Simplest reliable way for MSSQL < 2016 without MERGE complexity
                        cursor = conn.cursor()
                        cursor.execute("UPDATE visits SET count = count + 1 WHERE date = ?", (today,))
                        if cursor.rowcount == 0:
                            cursor.execute("INSERT INTO visits (date, count) VALUES (?, 1)", (today,))
                            
                    conn.commit()
                finally:
                    conn.close()
                
                # Fetch response
                total_res = execute_query('SELECT SUM(count) as t FROM visits', fetch=True)
                total = total_res[0]['t'] if total_res and total_res[0]['t'] else 0
                
                today_res = execute_query('SELECT count FROM visits WHERE date = ?', (today,), fetch=True)
                today_count = today_res[0]['count'] if today_res else 0
                
                self.send_json({"visits": total, "today": today_count})
                return

            elif path == '/api/settings':
                # Upsert settings
                conn, db_type = get_db_connection()
                try:
                    cursor = conn.cursor()
                    for k, v in data.items():
                        # Using string conversion for value
                        val_str = str(v)
                        
                        if db_type == 'sqlite':
                            cursor.execute('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', (k, val_str))
                        else:
                            # MSSQL Upsert
                            cursor.execute("UPDATE settings SET value = ? WHERE [key] = ?", (val_str, k))
                            if cursor.rowcount == 0:
                                cursor.execute("INSERT INTO settings ([key], value) VALUES (?, ?)", (k, val_str))
                    conn.commit()
                finally:
                    conn.close()
                    
                self.send_json({"status": "success"})
                return
                
            else:
                self.send_error(404, "Not Found")
        except Exception as e:
            print(f"Server Error (POST): {e}")
            self.send_error_json(500, str(e))

    def do_PUT(self):
        path = self.path.split('?')[0]
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length).decode('utf-8')
        data = json.loads(body)

        if path == '/api/admins':
            username = data.get('username')
            new_password = data.get('newPassword')
            
            execute_query('UPDATE admins SET password = ? WHERE username = ?', (new_password, username), commit=True)
            self.send_json({"status": "success"})
            return
        else:
             self.send_error(404)

    def do_DELETE(self):
        path = self.path.split('?')[0]
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length).decode('utf-8')
        data = json.loads(body)
        
        if path == '/api/admins':
            username = data.get('username')
            execute_query('DELETE FROM admins WHERE username = ?', (username,), commit=True)
            self.send_json({"status": "success"})
            return
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
init_db()

# Allow reuse of port
socketserver.TCPServer.allow_reuse_address = True

print(f"Starting Python server on http://localhost:{PORT}")
print("Config: db_config.json")

with socketserver.TCPServer(("", PORT), RequestHandler) as httpd:
    httpd.serve_forever()
