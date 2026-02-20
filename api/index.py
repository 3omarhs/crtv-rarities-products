import sys
import os

# Add src to path so we can import RequestHandler
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'src'))

from server import RequestHandler

# Vercel's Python runtime will use the last class inheriting from BaseHTTPRequestHandler in the file
# as the handler, but it's safer to just provide it here.
# Vercel's Python runtime analyzes the AST to find `class handler(BaseHTTPRequestHandler)` or `app=...`.
class handler(RequestHandler):
    pass
