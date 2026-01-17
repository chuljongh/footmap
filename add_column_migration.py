"""
DB 스키마 마이그레이션 스크립트
- Route 테이블에 approach_path 컬럼을 추가합니다.
"""
import os
import psycopg2
from urllib.parse import urlparse

DATABASE_URL = os.environ.get('DATABASE_URL')

def add_column():
    if not DATABASE_URL:
        print("Error: DATABASE_URL not found.")
        return

    result = urlparse(DATABASE_URL)
    username = result.username
    password = result.password
    database = result.path[1:]
    hostname = result.hostname
    port = result.port

    conn = None
    try:
        conn = psycopg2.connect(
            database=database,
            user=username,
            password=password,
            host=hostname,
            port=port
        )
        cur = conn.cursor()

        # 컬럼 존재 여부 확인
        cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='route' AND column_name='approach_path';")
        if cur.fetchone():
            print("✅ approach_path column already exists.")
        else:
            print("➕ Adding approach_path column...")
            cur.execute("ALTER TABLE route ADD COLUMN approach_path TEXT;")
            conn.commit()
            print("✅ Column added successfully.")

        cur.close()
    except Exception as e:
        print(f"❌ Migration failed: {e}")
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    add_column()
