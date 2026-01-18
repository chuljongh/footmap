import requests
import json

URL = "https://balgilmaeb.onrender.com/api/trajectories"

try:
    print(f"Fetching data from {URL}...")
    response = requests.get(URL, timeout=10)
    response.raise_for_status()
    routes = response.json()

    print(f"Fetched {len(routes)} routes.")

    invalid_count = 0
    empty_count = 0

    for r in routes:
        route_id = r.get('id')
        points_str = r.get('points')

        if not points_str:
            print(f"[WARN] Route {route_id}: Points field is EMPTY or NULL")
            empty_count += 1
            continue

        try:
            points = json.loads(points_str)
            if not isinstance(points, list):
                print(f"[ERR] Route {route_id}: Parsed points is NOT a list (Type: {type(points)})")
                invalid_count += 1
        except json.JSONDecodeError as e:
            print(f"[CRITICAL] Route {route_id}: JSON Parse Error - {e}")
            print(f"   --> Content prefix: {str(points_str)[:50]}...")
            invalid_count += 1
        except Exception as e:
            print(f"[ERR] Route {route_id}: Unexpected error - {e}")
            invalid_count += 1

    print("-" * 30)
    print(f"Validation Complete.")
    print(f"Total Routes Checked: {len(routes)}")
    print(f"Empty Points: {empty_count}")
    print(f"Invalid JSON: {invalid_count}")

    if invalid_count > 0 or empty_count > 0:
        print("\nCONCLUSION: Rendering will FAIL because of these bad records.")
    else:
        print("\nCONCLUSION: Data looks clean. Problem might be elsewhere.")

except Exception as e:
    print(f"Script failed: {e}")
