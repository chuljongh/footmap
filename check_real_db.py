
import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

db_url = os.getenv('DATABASE_URL')
if not db_url:
    print("Error: DATABASE_URL not found in .env")
    exit(1)

print(f"Connecting to DB...")
try:
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()

    # Check Route table
    print("\n--- Route Table (Real DB) ---")
    cur.execute("SELECT count(*) FROM route;")
    count = cur.fetchone()[0]
    print(f"Total Routes: {count}")

    print("\n--- Last 5 Routes ---")
    # Postgres uses "timestamp without time zone" usually, verify column name
    cur.execute("SELECT id, user_id, distance, duration, mode, timestamp FROM route ORDER BY id DESC LIMIT 5;")
    rows = cur.fetchall()
    for r in rows:
        print(f"ID: {r[0]}, User: {r[1]}, Dist: {r[2]}km, Mode: {r[4]}, Time: {r[5]}")

    cur.close()
    conn.close()

except Exception as e:
    print(f"Connection Failed: {e}")
