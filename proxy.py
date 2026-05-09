#!/usr/bin/env python3
"""
CORS Proxy for Research Archive LLM requests.
Zero dependencies — uses only Python 3 standard library.

Usage:
    python3 proxy.py

Then in Settings set:
    Base URL: https://api.kimi.com/coding
    Proxy URL: http://localhost:5000
"""
import http.server
import socketserver
import urllib.request
import urllib.error
import urllib.parse

PORT = 5000

class ProxyHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # keep quiet

    def do_OPTIONS(self):
        self.send_response(200)
        self._send_cors_headers()
        self.end_headers()

    def do_POST(self):
        target = self._get_target()
        if not target:
            return

        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length)

        headers = self._filter_headers()
        headers['Accept-Encoding'] = 'identity'
        req = urllib.request.Request(
            target,
            data=body,
            method='POST',
            headers=headers
        )

        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                self.send_response(resp.status)
                self._send_cors_headers()
                ct = resp.headers.get('Content-Type', 'application/json')
                self.send_header('Content-Type', ct)
                self.end_headers()
                self.wfile.write(resp.read())
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            self._send_cors_headers()
            self.end_headers()
            self.wfile.write(e.read())
        except Exception as e:
            self.send_response(502)
            self._send_cors_headers()
            self.end_headers()
            self.wfile.write(str(e).encode())

    def _send_cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, x-api-key, anthropic-version, Authorization')

    def _get_target(self):
        parsed = urllib.parse.urlparse(self.path)
        qs = urllib.parse.parse_qs(parsed.query)
        target = qs.get('target', [None])[0]
        if not target:
            self.send_error(400, "Missing ?target= parameter")
            return None
        return target

    def _filter_headers(self):
        skip = {'host', 'origin', 'referer', 'content-length', 'connection', 'accept-encoding'}
        headers = {}
        for key, value in self.headers.items():
            if key.lower() not in skip:
                headers[key] = value
        return headers


if __name__ == '__main__':
    with socketserver.TCPServer(("", PORT), ProxyHandler) as httpd:
        print(f"CORS Proxy running at http://localhost:{PORT}")
        print(f"In Settings, set Proxy URL to: http://localhost:{PORT}")
        httpd.serve_forever()
