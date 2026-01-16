import os
import sqlite3

# Default path for Flask-SQLAlchemy with SQLite
db_path = os.path.join('instance', 'balgil.db')

if not os.path.exists(db_path):
    print(f"Database not found at {db_path}")
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

print("--- Route Table Status ---")
try:
    cursor.execute("SELECT COUNT(*) FROM route")
    count = cursor.fetchone()[0]
    print(f"Total Routes: {count}")

    print("\n--- Last 5 Routes ---")
    cursor.execute("SELECT id, user_id, distance, duration, mode, timestamp FROM route ORDER BY id DESC LIMIT 5")
    routes = cursor.fetchall()
    for r in routes:
        print(f"ID: {r[0]}, User: {r[1]}, Dist: {round(r[2], 3)}km, Dur: {round(r[3], 1)}s, Mode: {r[4]}, Time: {r[5]}")

    print("\n--- Route Details (Points Count) ---")
    cursor.execute("SELECT id, length(points_json) FROM route ORDER BY id DESC LIMIT 5")
    for r in routes:
        cursor.execute("SELECT length(points_json) FROM route WHERE id=?", (r[0],))
        len_points = cursor.fetchone()[0]
        print(f"ID: {r[0]} - Points Data Size: {len_points} bytes")

except Exception as e:
    print(f"Error: {e}")

conn.close()
