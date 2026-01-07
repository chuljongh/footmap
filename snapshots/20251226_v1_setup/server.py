import http.server
import socketserver
import urllib.request
import urllib.parse
import json
import sys

PORT = 8000
KAKAO_REST_API_KEY = "63106d5c2ee3c16a39a6dfb41960da8a"  # Screenshot-derived key

class ProxyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        # API Proxy endpoint for Search
        if self.path.startswith('/api/search'):
            self.handle_search_proxy()
        # API Proxy endpoint for Reverse Geocoding
        elif self.path.startswith('/api/reverse-geo'):
            self.handle_reverse_geo_proxy()
        else:
            super().do_GET()

    def handle_search_proxy(self):
        try:
            query_components = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            query = query_components.get('query', [''])[0]
            
            if not query:
                self.send_error(400, "Missing query parameter")
                return

            api_url = f"https://dapi.kakao.com/v2/local/search/keyword.json?query={urllib.parse.quote(query)}"
            self.proxy_request_to_kakao(api_url)
        except Exception as e:
            self.send_error(500, str(e))

    def handle_reverse_geo_proxy(self):
        try:
            query_components = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            x = query_components.get('x', [''])[0]
            y = query_components.get('y', [''])[0]
            
            if not x or not y:
                self.send_error(400, "Missing x or y parameter")
                return

            api_url = f"https://dapi.kakao.com/v2/local/geo/coord2address.json?x={x}&y={y}"
            self.proxy_request_to_kakao(api_url)
        except Exception as e:
            self.send_error(500, str(e))

    def proxy_request_to_kakao(self, api_url):
        req = urllib.request.Request(api_url)
        req.add_header("Authorization", f"KakaoAK {KAKAO_REST_API_KEY}")
        
        try:
            with urllib.request.urlopen(req) as response:
                data = response.read()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(data)
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            self.end_headers()
            self.wfile.write(e.read())
        except Exception as e:
            self.send_error(500, str(e))

if __name__ == "__main__":
    Handler = ProxyHTTPRequestHandler
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"Serving at port {PORT}")
        print(f"Kakao REST API Proxy Active")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
