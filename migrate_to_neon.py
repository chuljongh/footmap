import os
import sqlite3
from datetime import datetime
from dotenv import load_dotenv
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from zoneinfo import ZoneInfo

# KST 타임존 설정
KST = ZoneInfo("Asia/Seoul")

def get_kst_now():
    return datetime.now(KST).replace(tzinfo=None)

# 1. 환경 설정 로드
load_dotenv()
DATABASE_URL = os.environ.get('DATABASE_URL')
if not DATABASE_URL or 'neon.tech' not in DATABASE_URL:
    print("❌ 에러: DATABASE_URL이 Neon DB 주소가 아닙니다. .env 파일을 확인하세요.")
    exit(1)

# SQLite 경로
SQLITE_DB = 'instance/balgil.db'

# 2. Flask 앱 및 SQLAlchemy 초기화 (Neon 연결)
app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = DATABASE_URL
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# 3. 모델 정의 (server.py와 동일)
class User(db.Model):
    id = db.Column(db.String(100), primary_key=True)
    profile_img = db.Column(db.Text)
    nickname = db.Column(db.String(100))
    points = db.Column(db.Integer, default=0)
    total_distance = db.Column(db.Float, default=0.0)
    dist_walking = db.Column(db.Float, default=0.0)
    dist_wheelchair = db.Column(db.Float, default=0.0)
    dist_vehicle = db.Column(db.Float, default=0.0)
    bio = db.Column(db.String(200))
    created_at = db.Column(db.DateTime, default=get_kst_now)

class Message(db.Model):
    id = db.Column(db.String(50), primary_key=True)
    user_id = db.Column(db.String(100), db.ForeignKey('user.id'), nullable=False)
    text = db.Column(db.String(200), nullable=False)
    coord_x = db.Column(db.Float, nullable=False)
    coord_y = db.Column(db.Float, nullable=False)
    tags = db.Column(db.String(50))
    address = db.Column(db.String(300))
    address_base = db.Column(db.String(200))
    likes = db.Column(db.Integer, default=0)
    dislikes = db.Column(db.Integer, default=0)
    shares = db.Column(db.Integer, default=0)
    edited = db.Column(db.Boolean, default=False)
    timestamp = db.Column(db.DateTime, default=get_kst_now)

class Comment(db.Model):
    id = db.Column(db.String(50), primary_key=True)
    message_id = db.Column(db.String(50), db.ForeignKey('message.id'), nullable=False)
    user_id = db.Column(db.String(100), db.ForeignKey('user.id'), nullable=False)
    text = db.Column(db.String(200), nullable=False)
    timestamp = db.Column(db.DateTime, default=get_kst_now)

class Vote(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    message_id = db.Column(db.String(50), db.ForeignKey('message.id'), nullable=False)
    user_id = db.Column(db.String(100), db.ForeignKey('user.id'), nullable=False)
    vote_type = db.Column(db.String(10), nullable=False)
    __table_args__ = (db.UniqueConstraint('message_id', 'user_id'),)

class Route(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(100), db.ForeignKey('user.id'), nullable=False)
    distance = db.Column(db.Float)
    duration = db.Column(db.Integer)
    mode = db.Column(db.String(20))
    start_coords = db.Column(db.String(50))
    end_coords = db.Column(db.String(50))
    points_json = db.Column(db.Text)
    approach_path = db.Column(db.Text)
    timestamp = db.Column(db.DateTime, default=get_kst_now)

class SavedMessage(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(100), db.ForeignKey('user.id'), nullable=False)
    message_id = db.Column(db.String(50), db.ForeignKey('message.id'), nullable=False)
    timestamp = db.Column(db.DateTime, default=get_kst_now)
    __table_args__ = (db.UniqueConstraint('user_id', 'message_id'),)

# 4. 마이그레이션 실행
def migrate():
    print("🚀 Neon DB에 테이블 생성 중...")
    with app.app_context():
        db.create_all()

    print(f"📂 SQLite 연결 ({SQLITE_DB})...")
    sqlite_conn = sqlite3.connect(SQLITE_DB)
    sqlite_conn.row_factory = sqlite3.Row
    cursor = sqlite_conn.cursor()

    with app.app_context():
        # User 마이그레이션
        print("\n👤 User 데이터 이전 중...")
        cursor.execute("SELECT * FROM user")
        users = cursor.fetchall()
        for u_row in users:
            u = dict(u_row)
            if not User.query.get(u['id']):
                new_user = User(
                    id=u['id'],
                    profile_img=u.get('profile_img'),
                    nickname=u.get('nickname'),
                    points=u.get('points', 0),
                    total_distance=u.get('total_distance', 0.0),
                    dist_walking=u.get('dist_walking', 0.0),
                    dist_wheelchair=u.get('dist_wheelchair', 0.0),
                    dist_vehicle=u.get('dist_vehicle', 0.0),
                    bio=u.get('bio'),
                    created_at=datetime.fromisoformat(u['created_at']) if u.get('created_at') else get_kst_now()
                )
                db.session.add(new_user)
        db.session.commit()
        print(f"  ✅ {len(users)}개의 사용자 데이터 완료")

        # Message 마이그레이션
        print("\n💬 Message 데이터 이전 중...")
        cursor.execute("SELECT * FROM message")
        messages = cursor.fetchall()
        for m_row in messages:
            m = dict(m_row)
            if not Message.query.get(m['id']):
                new_msg = Message(
                    id=m['id'],
                    user_id=m['user_id'],
                    text=m['text'],
                    coord_x=m['coord_x'],
                    coord_y=m['coord_y'],
                    tags=m.get('tags'),
                    address=m.get('address'),
                    address_base=m.get('address_base'),
                    likes=m.get('likes', 0),
                    dislikes=m.get('dislikes', 0),
                    shares=m.get('shares', 0),
                    edited=bool(m.get('edited', False)),
                    timestamp=datetime.fromisoformat(m['timestamp']) if m.get('timestamp') else get_kst_now()
                )
                db.session.add(new_msg)
        db.session.commit()
        print(f"  ✅ {len(messages)}개의 메시지 완료")

        # Comment 마이그레이션
        print("\n📝 Comment 데이터 이전 중...")
        cursor.execute("SELECT * FROM comment")
        comments = cursor.fetchall()
        for c_row in comments:
            c = dict(c_row)
            if not Comment.query.get(c['id']):
                new_cmt = Comment(
                    id=c['id'],
                    message_id=c['message_id'],
                    user_id=c['user_id'],
                    text=c['text'],
                    timestamp=datetime.fromisoformat(c['timestamp']) if c.get('timestamp') else get_kst_now()
                )
                db.session.add(new_cmt)
        db.session.commit()
        print(f"  ✅ {len(comments)}개의 댓글 완료")

        # Route 마이그레이션
        print("\n🛣️ Route 데이터 이전 중...")
        cursor.execute("SELECT * FROM route")
        routes = cursor.fetchall()
        for r_row in routes:
            r = dict(r_row)
            new_route = Route(
                id=r['id'],
                user_id=r['user_id'],
                distance=r.get('distance', 0.0),
                duration=r.get('duration', 0),
                mode=r.get('mode', 'walking'),
                start_coords=r.get('start_coords'),
                end_coords=r.get('end_coords'),
                points_json=r.get('points_json'),
                approach_path=r.get('approach_path'),
                timestamp=datetime.fromisoformat(r['timestamp']) if r.get('timestamp') else get_kst_now()
            )
            db.session.merge(new_route)
        db.session.commit()
        print(f"  ✅ {len(routes)}개의 경로 내역 완료")

    sqlite_conn.close()
    print("\n🎉 모든 데이터가 Neon DB로 성공적으로 이전되었습니다!")

if __name__ == "__main__":
    migrate()
