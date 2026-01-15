"""
SQLite to Supabase Migration via API
로컬 SQLite 데이터를 Supabase PostgreSQL로 마이그레이션합니다.
"""
import sqlite3
import requests
import json

# 설정
LOCAL_DB = 'instance/balgil.db'
SERVER_URL = 'https://balgilmaeb.onrender.com'

# 로컬 SQLite 연결
print("📂 로컬 SQLite 연결 중...")
conn = sqlite3.connect(LOCAL_DB)
cursor = conn.cursor()

# 메시지 데이터 가져오기
# 스키마: id, user_id, text, coord_x, coord_y, tags, address, address_base, ...
print("\n💬 메시지 데이터 마이그레이션...")
cursor.execute("SELECT id, user_id, text, coord_x, coord_y, tags FROM message")
messages = cursor.fetchall()

print(f"  총 {len(messages)}개의 메시지 발견")

migrated_count = 0
for msg in messages:
    try:
        # API 요구사항에 맞게 데이터 구성
        # 필수: text, coords (배열 [lon, lat])
        # 선택: userId, tags
        data = {
            'text': msg[2] or '(내용 없음)',  # text
            'coords': [msg[3] or 0, msg[4] or 0],  # coords = [coord_x, coord_y]
            'userId': msg[1] or '익명',  # user_id
            'tags': msg[5] or ''  # tags
        }

        print(f"  전송 중: {data['text'][:30]}...")

        response = requests.post(
            f"{SERVER_URL}/api/messages",
            json=data,
            timeout=15
        )

        if response.status_code == 200 or response.status_code == 201:
            migrated_count += 1
            print(f"  ✅ 메시지 {migrated_count}/{len(messages)} 마이그레이션 완료")
        else:
            print(f"  ❌ 실패: {response.status_code} - {response.text[:100]}")
    except Exception as e:
        print(f"  ❌ 에러: {str(e)}")

print(f"\n✅ 메시지 마이그레이션 완료: {migrated_count}/{len(messages)}")

conn.close()
print("\n🎉 마이그레이션 완료!")
