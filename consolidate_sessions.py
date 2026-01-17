"""
경로 세션 통합 스크립트
- 같은 유저의 30초 이내 연속 레코드를 하나의 세션으로 간주
- 각 세션에서 최신 1개만 남기고 삭제
"""
import os
import psycopg2
from urllib.parse import urlparse
from datetime import datetime, timedelta

DATABASE_URL = os.environ.get('DATABASE_URL')

# 세션 구분 시간 간격 (30초 이상 떨어지면 다른 세션으로 간주)
SESSION_GAP_SECONDS = 30

def consolidate_sessions():
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

        # 1. 모든 레코드 조회 (유저별, 시간순)
        print("🔍 전체 레코드 분석 중...")
        cur.execute("""
            SELECT id, user_id, timestamp, distance, duration
            FROM route
            ORDER BY user_id, timestamp
        """)

        all_routes = cur.fetchall()
        print(f"📊 전체 레코드: {len(all_routes)}개")

        # 2. 세션별 그룹화
        sessions = []
        current_session = []
        prev_user = None
        prev_time = None

        for route in all_routes:
            route_id, user_id, timestamp, distance, duration = route

            # 새로운 유저거나, 이전 레코드와 30초 이상 차이나면 새 세션 시작
            if prev_user != user_id or (prev_time and (timestamp - prev_time).total_seconds() > SESSION_GAP_SECONDS):
                if current_session:
                    sessions.append(current_session)
                current_session = []

            current_session.append({
                'id': route_id,
                'user_id': user_id,
                'timestamp': timestamp,
                'distance': distance,
                'duration': duration
            })

            prev_user = user_id
            prev_time = timestamp

        # 마지막 세션 추가
        if current_session:
            sessions.append(current_session)

        print(f"📂 세션 수: {len(sessions)}개")

        # 3. 각 세션에서 중복 삭제 (마지막 레코드만 유지)
        total_deleted = 0
        sessions_with_duplicates = 0

        for session in sessions:
            if len(session) <= 1:
                continue  # 중복 없음

            sessions_with_duplicates += 1

            # 마지막 레코드 유지, 나머지 삭제
            keep_id = session[-1]['id']
            delete_ids = [r['id'] for r in session[:-1]]

            user_id = session[0]['user_id']
            time_range = f"{session[0]['timestamp']} ~ {session[-1]['timestamp']}"

            if len(session) > 5:  # 5개 이상인 경우만 로그 출력
                print(f"  - User: {user_id}, 세션: {len(session)}개 → {len(delete_ids)}개 삭제 (ID {keep_id} 유지)")

            # 삭제 실행
            cur.execute(
                "DELETE FROM route WHERE id = ANY(%s)",
                (delete_ids,)
            )
            total_deleted += cur.rowcount

        conn.commit()

        print(f"\n✅ 통합 완료!")
        print(f"   - 중복 세션 수: {sessions_with_duplicates}개")
        print(f"   - 총 삭제: {total_deleted}개")

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
    consolidate_sessions()
