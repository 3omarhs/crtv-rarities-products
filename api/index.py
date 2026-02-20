import sys
import os
import traceback
from http.server import BaseHTTPRequestHandler

class handler(BaseHTTPRequestHandler):
    def handle_request_safely(self):
        try:
            sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'src'))
            from server import RequestHandler
            RequestHandler(self.request, self.client_address, self.server)
        except Exception as e:
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain')
            self.end_headers()
            self.wfile.write(traceback.format_exc().encode('utf-8'))

    # Since BaseHTTPRequestHandler calls handle() internally, 
    # we just override handle() rather than do_GET/POST to intercept the pipeline entirely!
    def handle(self):
        self.handle_request_safely()
