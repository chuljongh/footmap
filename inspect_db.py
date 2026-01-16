
import sqlite3

def inspect_db():
    db_path = 'instance/balgil.db'
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        # Get all tables
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = cursor.fetchall()

        print(f"Database: {db_path}")
        print(f"Found {len(tables)} tables.")

        for table in tables:
            table_name = table[0]
            print(f"\n=== Table: {table_name} ===")

            # Get schema
            cursor.execute(f"PRAGMA table_info({table_name})")
            columns = cursor.fetchall()
            print("Schema:")
            for col in columns:
                print(f"  {col[1]} ({col[2]})")

            # Get row count
            cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
            count = cursor.fetchone()[0]
            print(f"Total rows: {count}")

            # Get first 5 rows
            if count > 0:
                print("First 5 rows:")
                cursor.execute(f"SELECT * FROM {table_name} LIMIT 5")
                rows = cursor.fetchall()
                for row in rows:
                    print(f"  {row}")

        conn.close()
    except Exception as e:
        print(f"Error inspecting database: {e}")

if __name__ == "__main__":
    inspect_db()
