from http.server import BaseHTTPRequestHandler

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'text/plain')
        self.end_headers()
        self.wfile.write("Hello from index.py".encode('utf-8'))
    def do_POST(self): self.do_GET()
    def do_DELETE(self): self.do_GET()
