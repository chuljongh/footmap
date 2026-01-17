"""
DB 타임스탬프 마이그레이션 스크립트
- 만약 데이터가 UTC로 저장되어 있었다면, +9시간을 더해 KST로 변환합니다.
- 만약 데이터가 이미 KST로 저장되어 있었다면, 별도 조치가 필요 없습니다.

실행 전 주의:
1. 현재 DB의 타임스탬프 상태를 먼저 확인하세요.
2. 변환이 필요한 경우에만 실행하세요.
"""

from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from datetime import timedelta
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.environ.get('DATABASE_URL')
if not DATABASE_URL:
    DATABASE_URL = 'sqlite:///balgil.db'

print(f"Using Database: {DATABASE_URL}")

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = DATABASE_URL
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# 모델 정의 (간략화)
class Route(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    timestamp = db.Column(db.DateTime)

class User(db.Model):
    id = db.Column(db.String(100), primary_key=True)
    created_at = db.Column(db.DateTime)

class Message(db.Model):
    id = db.Column(db.String(50), primary_key=True)
    timestamp = db.Column(db.DateTime)

def check_timestamps():
    """현재 저장된 타임스탬프 샘플 확인"""
    with app.app_context():
        print("\n=== 현재 저장된 타임스탬프 샘플 ===")

        routes = Route.query.order_by(Route.timestamp.desc()).limit(5).all()
        print("\n📍 Routes (최근 5개):")
        for r in routes:
            print(f"  ID {r.id}: {r.timestamp}")

        messages = Message.query.order_by(Message.timestamp.desc()).limit(5).all()
        print("\n💬 Messages (최근 5개):")
        for m in messages:
            print(f"  ID {m.id}: {m.timestamp}")

def migrate_utc_to_kst():
    """UTC로 저장된 타임스탬프를 KST로 변환 (+9시간)"""
    with app.app_context():
        print("\n=== UTC → KST 마이그레이션 시작 ===")

        # Routes
        routes = Route.query.all()
        route_count = 0
        for r in routes:
            if r.timestamp:
                r.timestamp = r.timestamp + timedelta(hours=9)
                route_count += 1

        # Users
        users = User.query.all()
        user_count = 0
        for u in users:
            if u.created_at:
                u.created_at = u.created_at + timedelta(hours=9)
                user_count += 1

        # Messages
        messages = Message.query.all()
        message_count = 0
        for m in messages:
            if m.timestamp:
                m.timestamp = m.timestamp + timedelta(hours=9)
                message_count += 1

        db.session.commit()

        print(f"✅ Routes: {route_count}건 변환 완료")
        print(f"✅ Users: {user_count}건 변환 완료")
        print(f"✅ Messages: {message_count}건 변환 완료")

def migrate_kst_to_utc():
    """KST로 잘못 저장된 타임스탬프를 UTC로 롤백 (-9시간)"""
    with app.app_context():
        print("\n=== KST → UTC 롤백 시작 ===")

        # Routes
        routes = Route.query.all()
        route_count = 0
        for r in routes:
            if r.timestamp:
                r.timestamp = r.timestamp - timedelta(hours=9)
                route_count += 1

        db.session.commit()
        print(f"✅ Routes: {route_count}건 롤백 완료")

if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("사용법:")
        print("  python fix_kst_timestamps.py check     - 현재 타임스탬프 확인")
        print("  python fix_kst_timestamps.py to_kst    - UTC → KST 변환 (+9시간)")
        print("  python fix_kst_timestamps.py to_utc    - KST → UTC 롤백 (-9시간)")
        sys.exit(1)

    command = sys.argv[1]

    if command == "check":
        check_timestamps()
    elif command == "to_kst":
        check_timestamps()
        confirm = input("\n위 데이터에 +9시간을 적용하시겠습니까? (yes/no): ")
        if confirm.lower() == "yes":
            migrate_utc_to_kst()
            print("\n=== 변환 후 결과 ===")
            check_timestamps()
        else:
            print("취소됨")
    elif command == "to_utc":
        check_timestamps()
        confirm = input("\n위 데이터에 -9시간을 적용하시겠습니까? (yes/no): ")
        if confirm.lower() == "yes":
            migrate_kst_to_utc()
            print("\n=== 변환 후 결과 ===")
            check_timestamps()
        else:
            print("취소됨")
    else:
        print(f"알 수 없는 명령어: {command}")
