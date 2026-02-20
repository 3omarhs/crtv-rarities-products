import sys
import os
import traceback
from http.server import BaseHTTPRequestHandler

try:
    sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'src'))
    from server import RequestHandler
    handler = RequestHandler
except Exception as e:
    err_msg = traceback.format_exc()
    class handler(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain')
            self.end_headers()
            self.wfile.write(f"Fatal Import Error:\n{err_msg}".encode('utf-8'))
        def do_POST(self): self.do_GET()
        def do_DELETE(self): self.do_GET()
