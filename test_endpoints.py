import requests

# Test multiple endpoints to see if server is up
endpoints = [
    "/api/messages",  # 메시지 목록
    "/api/trajectories",  # 궤적 (문제 의심)
]

BASE = "https://balgilmaeb.onrender.com"

for ep in endpoints:
    url = BASE + ep
    try:
        print(f"Testing {ep}...")
        r = requests.get(url, timeout=15)
        print(f"  Status: {r.status_code}, Length: {len(r.text)} bytes")
    except Exception as e:
        print(f"  Error: {e}")
