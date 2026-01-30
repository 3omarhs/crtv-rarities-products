import http.server
import socketserver

PORT = 8084
Handler = http.server.SimpleHTTPRequestHandler

print(f"serving at port {PORT}")
with socketserver.TCPServer(("", PORT), Handler) as httpd:
    httpd.serve_forever()
