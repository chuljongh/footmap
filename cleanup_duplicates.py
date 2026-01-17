"""
중복 Route 레코드 정리 스크립트
- Duration이 1초인 동일 distance 레코드들 중 최신 1개만 남기고 삭제
"""
import os
import psycopg2
from urllib.parse import urlparse
from datetime import timedelta

DATABASE_URL = os.environ.get('DATABASE_URL')

def clean_duplicates():
    if not DATABASE_URL:
        print("Error: DATABASE_URL not found.")
        return

    result = urlparse(DATABASE_URL)

    conn = None
    try:
        conn = psycopg2.connect(
            database=result.path[1:],
            user=result.username,
            password=result.password,
            host=result.hostname,
            port=result.port
        )
        cur = conn.cursor()

        # 1. 중복 후보 조회: duration=1이고 동일 user_id, distance를 가진 레코드 그룹
        print("🔍 중복 레코드 분석 중...")
        cur.execute("""
            SELECT user_id, distance, COUNT(*) as cnt,
                   MIN(id) as min_id, MAX(id) as max_id
            FROM route
            WHERE duration = 1
            GROUP BY user_id, distance
            HAVING COUNT(*) > 1
            ORDER BY cnt DESC
        """)

        groups = cur.fetchall()
        print(f"📊 중복 그룹 발견: {len(groups)}개")

        total_deleted = 0

        for group in groups:
            user_id, distance, cnt, min_id, max_id = group
            print(f"  - User: {user_id}, Distance: {distance}km, 중복: {cnt}개")

            # 각 그룹에서 가장 최신 레코드(max_id)만 남기고 삭제
            cur.execute("""
                DELETE FROM route
                WHERE user_id = %s AND distance = %s AND duration = 1 AND id != %s
            """, (user_id, distance, max_id))

            deleted = cur.rowcount
            total_deleted += deleted
            print(f"    → {deleted}개 삭제됨 (ID {max_id} 유지)")

        conn.commit()
        print(f"\n✅ 총 {total_deleted}개 중복 레코드 삭제 완료!")

        # 정리 후 상태 확인
        cur.execute("SELECT COUNT(*) FROM route")
        remaining = cur.fetchone()[0]
        print(f"📌 남은 Route 레코드: {remaining}개")

        cur.close()
    except Exception as e:
        print(f"❌ 에러 발생: {e}")
        if conn:
            conn.rollback()
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    clean_duplicates()
