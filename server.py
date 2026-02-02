import http.server
import socketserver
import os
import re
import sys
import json

PORT = 8000
UPLOAD_DIR = os.path.join(os.getcwd(), 'assets', 'products')

# Ensure directory exists
os.makedirs(UPLOAD_DIR, exist_ok=True)

class RequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_POST(self):
        if self.path == '/api/upload-images':
            self.handle_upload()
        else:
            self.send_error(404, "Not Found")

    def handle_upload(self):
        try:
            content_type = self.headers.get('Content-Type', '')
            if 'multipart/form-data' not in content_type:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(b'{"status":"error", "message":"Content-Type must be multipart/form-data"}')
                return

            try:
                boundary = content_type.split("boundary=")[1].encode()
            except IndexError:
                 self.send_response(400)
                 self.end_headers()
                 self.wfile.write(b'{"status":"error", "message":"Boundary missing in Content-Type"}')
                 return

            content_length = int(self.headers.get('Content-Length'))
            body = self.rfile.read(content_length)
            
            # Identify Separator
            # Note: Boundary in body starts with --
            separator = b'--' + boundary
            
            # Split body
            # The split list will have: [preamble, part1, part2, ..., epilogue]
            parts = body.split(separator)
            
            product_no = None
            saved_files = []

            for part in parts:
                if not part or part == b'--\r\n' or part == b'--': continue
                
                # Each part starts with \r\n (except the very first if preamble is empty, but usually multipart sends boundary first)
                # Actually, split consumes the separator. 
                # Request Body: --boundary\r\nHeaders\r\n\r\nContent\r\n--boundary...
                # So parts[1] (first real part) will start with \r\nHeaders...
                
                # Trim leading \r\n if present
                if part.startswith(b'\r\n'):
                    part = part[2:]
                
                # Locate headers end
                headers_end = part.find(b'\r\n\r\n')
                if headers_end == -1: continue # invalid part?
                
                headers_raw = part[:headers_end].decode('utf-8', errors='ignore')
                content = part[headers_end+4:]
                
                # Remove trailing \r\n which belongs to the next boundary framing
                if content.endswith(b'\r\n'):
                    content = content[:-2]
                
                # Parse Headers to find Content-Disposition
                # Look for name="productNo" or filename="..."
                
                if 'name="productNo"' in headers_raw:
                     product_no = content.decode('utf-8').strip()
                
                elif 'filename="' in headers_raw:
                    # Extract filename
                    match = re.search(r'filename="(.+?)"', headers_raw)
                    if match:
                        original_filename = match.group(1)
                        if not product_no:
                            # If productNo hasn't been found yet, we can't name correctly!
                            # Client MUST send productNo first.
                            # We'll buffer this or imply error? 
                            # If manual parsing order matters, FormData normally respects append order.
                            pass
                            
                        # If we have productNo (or if we wait, but let's assume valid order for now)
                        # Fallback: if product_no is missing, use 'unknown'
                        p_no = product_no if product_no else "unknown"
                        
                        ext = os.path.splitext(original_filename)[1]
                        if not ext: ext = '.jpg'

                        # Uniquify
                        index = 1
                        while True:
                            new_filename = f"{p_no}_{index}{ext}"
                            file_path = os.path.join(UPLOAD_DIR, new_filename)
                            if not os.path.exists(file_path):
                                break
                            index += 1
                            if index > 1000: break

                        with open(file_path, 'wb') as f:
                            f.write(content)
                        saved_files.append(new_filename)

            if not product_no and not saved_files:
                 # Nothing processed
                 self.send_response(400)
                 self.end_headers()
                 self.wfile.write(b'{"status":"error", "message":"No product number or files found. Ensure keys are productNo and images."}')
                 return

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            response = json.dumps({"status": "success", "message": f"Uploaded {len(saved_files)} files for {product_no}.", "files": saved_files})
            self.wfile.write(response.encode())

        except Exception as e:
            print(f"Error: {e}")
            import traceback
            traceback.print_exc()
            self.send_response(500)
            self.end_headers()
            self.wfile.write(f'{{"status":"error", "message":"{str(e)}"}}'.encode())

print(f"Starting server on http://localhost:{PORT}")
print(f"Uploads will go to: {UPLOAD_DIR}")

# Reuse address
socketserver.TCPServer.allow_reuse_address = True

with socketserver.TCPServer(("", PORT), RequestHandler) as httpd:
    httpd.serve_forever()
