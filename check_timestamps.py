import os
from dotenv import load_dotenv
import psycopg2
from datetime import datetime

load_dotenv()

DATABASE_URL = os.environ.get('DATABASE_URL')
if not DATABASE_URL:
    print("ERROR: DATABASE_URL not set in .env")
    exit(1)

print(f"Connecting to: {DATABASE_URL[:50]}...")

try:
    conn = psycopg2.connect(DATABASE_URL)
    cursor = conn.cursor()

    # Check Route timestamps
    print("\n=== Recent Routes (timestamp check) ===")
    cursor.execute("SELECT id, user_id, timestamp FROM route ORDER BY timestamp DESC LIMIT 5")
    routes = cursor.fetchall()
    if routes:
        for r in routes:
            print(f"ID: {r[0]}, User: {r[1]}, Timestamp: {r[2]}")
    else:
        print("No routes found")

    # Check Message timestamps
    print("\n=== Recent Messages (timestamp check) ===")
    cursor.execute("SELECT id, user_id, timestamp FROM message ORDER BY timestamp DESC LIMIT 5")
    messages = cursor.fetchall()
    if messages:
        for m in messages:
            print(f"ID: {m[0]}, User: {m[1]}, Timestamp: {m[2]}")
    else:
        print("No messages found")

    # Current time comparison
    print(f"\n=== Time Reference ===")
    print(f"Current KST (Python): {datetime.now()}")

    conn.close()
except Exception as e:
    print(f"Error: {e}")
