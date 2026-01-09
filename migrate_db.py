import sqlite3
import os

db_path = 'instance/balgil.db'
if not os.path.exists(db_path):
    print("Database not found")
    exit(0)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()
try:
    # Check if columns exist
    cursor.execute("PRAGMA table_info(user)")
    columns = [row[1] for row in cursor.fetchall()]

    if 'dist_walking' not in columns:
        cursor.execute("ALTER TABLE user ADD COLUMN dist_walking FLOAT DEFAULT 0.0")
        print("Added dist_walking")
    if 'dist_wheelchair' not in columns:
        cursor.execute("ALTER TABLE user ADD COLUMN dist_wheelchair FLOAT DEFAULT 0.0")
        print("Added dist_wheelchair")
    if 'dist_vehicle' not in columns:
        cursor.execute("ALTER TABLE user ADD COLUMN dist_vehicle FLOAT DEFAULT 0.0")
        print("Added dist_vehicle")

    conn.commit()
    print("Migration complete")
except Exception as e:
    print(f"Error: {e}")
finally:
    conn.close()
