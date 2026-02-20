import sys
import os
import traceback
from http.server import BaseHTTPRequestHandler

class DummyHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'text/plain')
        self.end_headers()
        self.wfile.write(f"Vercel Error:\n{HandlerProxy.global_error}".encode('utf-8'))
    def do_POST(self): self.do_GET()
    def do_DELETE(self): self.do_GET()

class HandlerProxy(DummyHandler):
    global_error = "No error"
    
    def __init__(self, request, client_address, server):
        if hasattr(HandlerProxy, 'real_handler_class'):
            self.real_handler = HandlerProxy.real_handler_class(request, client_address, server)
        else:
            super().__init__(request, client_address, server)
            
    def __getattribute__(self, name):
        if name != 'real_handler_class' and name != 'real_handler' and hasattr(self, 'real_handler'):
            return getattr(self.real_handler, name)
        return super().__getattribute__(name)

try:
    sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'src'))
    from server import RequestHandler
    HandlerProxy.real_handler_class = RequestHandler
except Exception as e:
    HandlerProxy.global_error = traceback.format_exc()

# Top-level assignment that satisfies Vercel AST Parser
handler = HandlerProxy
