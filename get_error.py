import requests

url = "https://balgilmaeb.onrender.com/api/trajectories"
r = requests.get(url, timeout=15)
print(f"Status: {r.status_code}")
print(f"Response Body:")
print(r.text)
