from flask import Flask, request, jsonify, send_from_directory, render_template
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
import urllib.request
import urllib.parse
import os
from dotenv import load_dotenv

load_dotenv()
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

# KST 타임존 설정
KST = ZoneInfo("Asia/Seoul")

def get_kst_now():
    """현재 한국 시간을 반환 (Naive)"""
    return datetime.now(KST).replace(tzinfo=None)

# ========================================
# 환경 설정 (자동 전환 전략)
# ========================================
# 환경 변수에 DATABASE_URL이 있으면 우선 사용 (PostgreSQL)
# 없으면 로컬 SQLite 사용
DATABASE_URL = os.environ.get('DATABASE_URL')
if not DATABASE_URL:
    DATABASE_URL = 'sqlite:///balgil.db'

print(f"Using Database: {DATABASE_URL}")

app = Flask(__name__, static_folder='.', static_url_path='', template_folder='templates')
app.config['SQLALCHEMY_DATABASE_URI'] = DATABASE_URL
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
CORS(app)

db = SQLAlchemy(app)

PORT = int(os.environ.get('PORT', 8000))
KAKAO_REST_API_KEY = "63106d5c2ee3c16a39a6dfb41960da8a"

# ========================================
# 데이터베이스 모델
# ========================================
class User(db.Model):
    """사용자 정보 및 활동 통계"""
    id = db.Column(db.String(100), primary_key=True) # 닉네임을 ID로 사용
    profile_img = db.Column(db.Text)
    points = db.Column(db.Integer, default=0)
    total_distance = db.Column(db.Float, default=0.0)
    dist_walking = db.Column(db.Float, default=0.0)
    dist_wheelchair = db.Column(db.Float, default=0.0)
    dist_vehicle = db.Column(db.Float, default=0.0)
    bio = db.Column(db.String(200))
    created_at = db.Column(db.DateTime, default=get_kst_now)

    def to_dict(self):
        return {
            'id': self.id,
            'profileImg': self.profile_img,
            'points': self.points,
            'totalDistance': self.total_distance,
            'distWalking': self.dist_walking,
            'distWheelchair': self.dist_wheelchair,
            'distVehicle': self.dist_vehicle,
            'bio': self.bio,
            'createdAt': int(self.created_at.replace(tzinfo=KST).timestamp() * 1000)
        }

class Message(db.Model):
    id = db.Column(db.String(50), primary_key=True)
    user_id = db.Column(db.String(100), db.ForeignKey('user.id'), nullable=False, index=True)
    text = db.Column(db.String(200), nullable=False)
    coord_x = db.Column(db.Float, nullable=False, index=True)  # 경도 (longitude)
    coord_y = db.Column(db.Float, nullable=False, index=True)  # 위도 (latitude)
    tags = db.Column(db.String(50))  # 해시태그
    address = db.Column(db.String(300))
    address_base = db.Column(db.String(200))
    likes = db.Column(db.Integer, default=0, index=True)
    dislikes = db.Column(db.Integer, default=0)
    shares = db.Column(db.Integer, default=0)
    edited = db.Column(db.Boolean, default=False)
    timestamp = db.Column(db.DateTime, default=get_kst_now, index=True)
    comments = db.relationship('Comment', backref='message', lazy=True, cascade='all, delete-orphan')

    def to_dict(self, include_comments=False):
        result = {
            'id': self.id,
            'userId': self.user_id,
            'text': self.text,
            'tags': self.tags,
            'coords': [self.coord_x, self.coord_y],
            'address': self.address,
            'addressBase': self.address_base,
            'likes': self.likes,
            'dislikes': self.dislikes,
            'shares': self.shares,
            'edited': self.edited,
            'timestamp': int(self.timestamp.replace(tzinfo=KST).timestamp() * 1000),
            'commentCount': len(self.comments)
        }
        if include_comments:
            result['comments'] = [c.to_dict() for c in sorted(self.comments, key=lambda x: x.timestamp)]
        return result

class Comment(db.Model):
    id = db.Column(db.String(50), primary_key=True)
    message_id = db.Column(db.String(50), db.ForeignKey('message.id'), nullable=False, index=True)
    user_id = db.Column(db.String(100), db.ForeignKey('user.id'), nullable=False)
    text = db.Column(db.String(200), nullable=False)
    timestamp = db.Column(db.DateTime, default=get_kst_now)

    def to_dict(self):
        return {
            'id': self.id,
            'messageId': self.message_id,
            'userId': self.user_id,
            'text': self.text,
            'timestamp': int(self.timestamp.replace(tzinfo=KST).timestamp() * 1000)
        }

class Vote(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    message_id = db.Column(db.String(50), db.ForeignKey('message.id'), nullable=False)
    user_id = db.Column(db.String(100), db.ForeignKey('user.id'), nullable=False)
    vote_type = db.Column(db.String(10), nullable=False)  # 'up' or 'down'

    __table_args__ = (db.UniqueConstraint('message_id', 'user_id'),)

class Route(db.Model):
    """이동 경로 기록 및 궤적 데이터 (집단지성용)"""
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(100), db.ForeignKey('user.id'), nullable=False, index=True)
    distance = db.Column(db.Float)  # 총 이동 거리 (km)
    duration = db.Column(db.Integer)  # 총 소요 시간 (seconds)
    mode = db.Column(db.String(20))  # 'pedestrian' or 'wheelchair'
    start_coords = db.Column(db.String(50))  # "lon,lat"
    end_coords = db.Column(db.String(50))  # "lon,lat"
    points_json = db.Column(db.Text)  # 전체 이동 궤적 (JSON string of coordinates)
    timestamp = db.Column(db.DateTime, default=get_kst_now, index=True)

    def to_dict(self):
        return {
            'id': self.id,
            'userId': self.user_id,
            'distance': self.distance,
            'duration': self.duration,
            'mode': self.mode,
            'startCoords': self.start_coords,
            'endCoords': self.end_coords,
            'points': self.points_json, # 프론트에서 JSON.parse() 필요
            'timestamp': int(self.timestamp.replace(tzinfo=KST).timestamp() * 1000)
        }

class SavedMessage(db.Model):
    """저장된 메시지 (스크랩/북마크)"""
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(100), db.ForeignKey('user.id'), nullable=False, index=True)
    message_id = db.Column(db.String(50), db.ForeignKey('message.id'), nullable=False, index=True)
    timestamp = db.Column(db.DateTime, default=get_kst_now)

    __table_args__ = (db.UniqueConstraint('user_id', 'message_id'),)

    def to_dict(self):
        return {
            'id': self.id,
            'userId': self.user_id,
            'messageId': self.message_id,
            'timestamp': int(self.timestamp.replace(tzinfo=KST).timestamp() * 1000)
        }

# ========================================
# 정적 파일 서빙 (index.html 등)
# ========================================
@app.route('/')
def serve_index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('.', path)

# ========================================
# 사용자 & 프로필 API
# ========================================
@app.route('/api/users/<user_id>', methods=['GET'])
def get_user_profile(user_id):
    user = User.query.get(user_id)
    if not user:
        # 미가입 사용자면 기본 정보 반환
        return jsonify({'id': user_id, 'points': 0, 'totalDistance': 0}), 200
    return jsonify(user.to_dict())

@app.route('/api/users/<user_id>', methods=['POST', 'PUT'])
def update_user_profile(user_id):
    data = request.json
    user = User.query.get(user_id)
    if not user:
        user = User(id=user_id)
        db.session.add(user)

    if 'profileImg' in data: user.profile_img = data['profileImg']
    if 'bio' in data: user.bio = data['bio']

    db.session.commit()
    return jsonify(user.to_dict())

def ensure_user(user_id):
    """사용자가 없으면 생성 (FK 제약 조건 해결용)"""
    user = User.query.get(user_id)
    if not user:
        user = User(id=user_id)
        db.session.add(user)
        db.session.commit()
    return user

# ========================================
# [NEW] 대시보드 API - 포인트 기반 레벨 시스템
# ========================================
LEVEL_THRESHOLDS = [
    {'level': 1, 'points': 0, 'title': '🌱 동네 새싹'},
    {'level': 2, 'points': 100, 'title': '🚶 동네 산책가'},
    {'level': 3, 'points': 300, 'title': '🏃 활동 주민'},
    {'level': 4, 'points': 700, 'title': '🏙️ 도시 탐험가'},
    {'level': 5, 'points': 1500, 'title': '🌏 지역 영웅'},
    {'level': 6, 'points': 3000, 'title': '🚀 발길의 전설'}
]

def get_level_info(points):
    """포인트로 레벨/칭호 계산"""
    current = LEVEL_THRESHOLDS[0]
    next_level = LEVEL_THRESHOLDS[1] if len(LEVEL_THRESHOLDS) > 1 else None

    for i, threshold in enumerate(LEVEL_THRESHOLDS):
        if points >= threshold['points']:
            current = threshold
            next_level = LEVEL_THRESHOLDS[i + 1] if i + 1 < len(LEVEL_THRESHOLDS) else None

    return {
        'level': current['level'],
        'title': current['title'],
        'currentPoints': points,
        'nextLevelPoints': next_level['points'] if next_level else None,
        'progress': (points - current['points']) / (next_level['points'] - current['points']) if next_level else 1.0
    }

@app.route('/api/user/<user_id>/dashboard', methods=['GET'])
def get_user_dashboard(user_id):
    """대시보드용 통합 통계 API"""
    user = ensure_user(user_id)

    # 1. 이동 통계
    routes = Route.query.filter_by(user_id=user_id).all()
    total_distance = sum(r.distance or 0 for r in routes)
    total_duration = sum(r.duration or 0 for r in routes)
    movement_points = int(total_distance * 10)

    recent_routes = sorted(routes, key=lambda r: r.timestamp, reverse=True)[:5]

    # 2. 소셜 통계
    messages = Message.query.filter_by(user_id=user_id).all()
    comments = Comment.query.filter_by(user_id=user_id).all()
    saved_messages = SavedMessage.query.filter_by(user_id=user_id).all()

    message_count = len(messages)
    comment_count = len(comments)
    likes_received = sum(m.likes or 0 for m in messages)

    message_points = message_count * 50
    like_points = likes_received * 5
    comment_points = comment_count * 20

    # 3. 총점 계산 및 레벨
    total_points = movement_points + message_points + like_points + comment_points

    # User 레코드 업데이트
    user.points = total_points
    user.total_distance = total_distance
    db.session.commit()

    level_info = get_level_info(total_points)

    # 4. 최근 활동 타임라인 (메시지 + 댓글 통합)
    recent_activity = []
    for m in sorted(messages, key=lambda x: x.timestamp, reverse=True)[:5]:
        recent_activity.append({
            'type': 'message',
            'text': m.text[:50] + '...' if len(m.text) > 50 else m.text,
            'timestamp': int(m.timestamp.timestamp() * 1000),
            'coords': [m.coord_x, m.coord_y]
        })
    for c in sorted(comments, key=lambda x: x.timestamp, reverse=True)[:5]:
        recent_activity.append({
            'type': 'comment',
            'text': c.text[:50] + '...' if len(c.text) > 50 else c.text,
            'timestamp': int(c.timestamp.timestamp() * 1000)
        })
    recent_activity = sorted(recent_activity, key=lambda x: x['timestamp'], reverse=True)[:10]

    return jsonify({
        'profile': {
            'id': user_id,
            **level_info
        },
        'movement': {
            'totalDistance': round(total_distance, 2),
            'totalDuration': total_duration,
            'calories': int(total_distance * 50),
            'trees': round(total_distance * 0.15, 1),
            'routeCount': len(routes),
            'recentRoutes': [r.to_dict() for r in recent_routes]
        },
        'social': {
            'messageCount': message_count,
            'commentCount': comment_count,
            'likesReceived': likes_received,
            'savedCount': len(saved_messages),
            'recentActivity': recent_activity
        },
        'pointsBreakdown': {
            'fromMovement': movement_points,
            'fromMessages': message_points,
            'fromLikes': like_points,
            'fromComments': comment_points,
            'total': total_points
        }
    })

# ========================================
# 카카오 API 프록시 (기존 기능 유지)
# ========================================
@app.route('/api/search')
def api_search():
    query = request.args.get('query', '')
    if not query:
        return jsonify({'error': 'Missing query'}), 400

    api_url = f"https://dapi.kakao.com/v2/local/search/keyword.json?query={urllib.parse.quote(query)}"
    return proxy_kakao(api_url)

@app.route('/api/reverse-geo')
def api_reverse_geo():
    x = request.args.get('x', '')
    y = request.args.get('y', '')
    if not x or not y:
        return jsonify({'error': 'Missing x or y'}), 400

    api_url = f"https://dapi.kakao.com/v2/local/geo/coord2address.json?x={x}&y={y}"
    return proxy_kakao(api_url)

def proxy_kakao(api_url):
    req = urllib.request.Request(api_url)
    req.add_header("Authorization", f"KakaoAK {KAKAO_REST_API_KEY}")
    try:
        with urllib.request.urlopen(req) as response:
            data = response.read()
            return app.response_class(response=data, status=200, mimetype='application/json')
    except urllib.error.HTTPError as e:
        return app.response_class(response=e.read(), status=e.code, mimetype='application/json')

# ========================================
# 메시지 API (커뮤니티 기능)
# ========================================
@app.route('/api/messages', methods=['GET'])
def get_messages():
    """지도 범위 내 메시지 조회"""
    # 선택적: 범위 필터 (min_x, max_x, min_y, max_y)
    min_x = request.args.get('min_x', type=float)
    max_x = request.args.get('max_x', type=float)
    min_y = request.args.get('min_y', type=float)
    max_y = request.args.get('max_y', type=float)

    query = Message.query

    if all([min_x, max_x, min_y, max_y]):
        query = query.filter(
            Message.coord_x >= min_x,
            Message.coord_x <= max_x,
            Message.coord_y >= min_y,
            Message.coord_y <= max_y
        )

    messages = query.order_by(Message.likes.desc(), Message.timestamp.desc()).limit(100).all()
    return jsonify([m.to_dict() for m in messages])

@app.route('/api/messages', methods=['POST'])
def create_message():
    """새 메시지 작성"""
    data = request.json
    if not data or not data.get('text') or not data.get('coords'):
        return jsonify({'error': 'Missing required fields'}), 400

    ensure_user(data.get('userId', '익명'))

    msg = Message(
        id=f"msg_{int(datetime.utcnow().timestamp() * 1000)}",
        user_id=data.get('userId', '익명'),
        text=data['text'][:140],  # 140자 제한
        coord_x=data['coords'][0],
        coord_y=data['coords'][1],
        tags=data.get('tags', '')  # 태그 저장 (없으면 빈 문자열, Frontend에서 처리 권장)
    )
    db.session.add(msg)
    db.session.commit()

    return jsonify(msg.to_dict()), 201

@app.route('/api/messages/<msg_id>', methods=['PUT'])
def update_message(msg_id):
    """메시지 수정 (본인만)"""
    data = request.json
    msg = Message.query.get(msg_id)

    if not msg:
        return jsonify({'error': 'Message not found'}), 404

    # 본인 확인 (간단 버전 - 실제 서비스에선 인증 토큰 사용)
    if data.get('userId') != msg.user_id:
        return jsonify({'error': 'Unauthorized'}), 403

    if data.get('text'):
        msg.text = data['text'][:140]
        msg.edited = True

    db.session.commit()
    return jsonify(msg.to_dict())

@app.route('/api/messages/<msg_id>', methods=['DELETE'])
def delete_message(msg_id):
    """메시지 삭제 (본인만)"""
    data = request.json or {}
    msg = Message.query.get(msg_id)

    if not msg:
        return jsonify({'error': 'Message not found'}), 404

    if data.get('userId') != msg.user_id:
        return jsonify({'error': 'Unauthorized'}), 403

    db.session.delete(msg)
    db.session.commit()
    return jsonify({'success': True})


# ========================================
# 댓글 API
# ========================================
@app.route('/api/messages/<msg_id>/detail', methods=['GET'])
def get_message_detail(msg_id):
    """메시지 상세 조회 (댓글 포함)"""
    msg = Message.query.get(msg_id)
    if not msg:
        return jsonify({'error': 'Message not found'}), 404

    # 요청한 사용자가 이 메시지를 저장했는지 확인
    user_id = request.args.get('userId', 'anonymous')
    is_saved = SavedMessage.query.filter_by(user_id=user_id, message_id=msg_id).first() is not None

    result = msg.to_dict(include_comments=True)
    result['isSavedByMe'] = is_saved
    return jsonify(result)

@app.route('/api/messages/<msg_id>/comments', methods=['POST'])
def add_comment(msg_id):
    """댓글 작성"""
    data = request.json
    if not data or not data.get('text'):
        return jsonify({'error': 'Missing text'}), 400

    msg = Message.query.get(msg_id)
    if not msg:
        return jsonify({'error': 'Message not found'}), 404

    comment = Comment(
        id=f"cmt_{int(datetime.utcnow().timestamp() * 1000)}",
        message_id=msg_id,
        user_id=data.get('userId', '익명'),
        text=data['text'][:200]
    )
    db.session.add(comment)
    db.session.commit()

    return jsonify(comment.to_dict()), 201

@app.route('/api/comments/<comment_id>', methods=['DELETE'])
def delete_comment(comment_id):
    """댓글 삭제 (본인만)"""
    data = request.json or {}
    comment = Comment.query.get(comment_id)

    if not comment:
        return jsonify({'error': 'Comment not found'}), 404

    if data.get('userId') != comment.user_id:
        return jsonify({'error': 'Unauthorized'}), 403

    db.session.delete(comment)
    db.session.commit()
    return jsonify({'success': True})

@app.route('/api/messages/by-address', methods=['GET'])
def get_messages_by_address():
    """주소 기반 메시지 조회 (플로팅 모드용)"""
    address = request.args.get('address', '')
    address_base = request.args.get('address_base', '')

    if not address and not address_base:
        return jsonify({'error': 'Missing address parameter'}), 400

    # 완전 일치 우선
    if address:
        msg = Message.query.filter_by(address=address).order_by(Message.likes.desc()).first()
        if msg:
            return jsonify(msg.to_dict())

    # 기본 주소 일치
    if address_base:
        msg = Message.query.filter_by(address_base=address_base).order_by(Message.likes.desc()).first()
        if msg:
            return jsonify(msg.to_dict())

    return jsonify(None)

# ========================================
# 사용자 활동 내역 API
# ========================================
@app.route('/api/users/<user_id>/messages', methods=['GET'])
def get_user_messages(user_id):
    """사용자가 작성한 메시지 목록"""
    messages = Message.query.filter_by(user_id=user_id).order_by(Message.timestamp.desc()).limit(50).all()
    return jsonify([m.to_dict() for m in messages])

@app.route('/api/users/<user_id>/comments', methods=['GET'])
def get_user_comments(user_id):
    """사용자가 작성한 댓글 목록"""
    comments = Comment.query.filter_by(user_id=user_id).order_by(Comment.timestamp.desc()).limit(50).all()
    return jsonify([c.to_dict() for c in comments])

@app.route('/api/users/<user_id>/saved', methods=['GET'])
def get_user_saved_messages(user_id):
    """사용자가 저장한 메시지 목록"""
    saved = SavedMessage.query.filter_by(user_id=user_id).order_by(SavedMessage.timestamp.desc()).limit(50).all()
    message_ids = [s.message_id for s in saved]
    messages = Message.query.filter(Message.id.in_(message_ids)).all() if message_ids else []
    # 저장 시간 순서 유지를 위해 정렬
    messages_dict = {m.id: m for m in messages}
    result = [messages_dict[mid].to_dict() for mid in message_ids if mid in messages_dict]
    return jsonify(result)

@app.route('/api/messages/<message_id>/vote', methods=['POST'])
def vote_message(message_id):
    """메시지 좋아요/싫어요 투표 (토글/스위칭 로직 적용)"""
    data = request.json
    user_id = data.get('userId')
    vote_type = data.get('type')  # 'up' or 'down'

    if not user_id or vote_type not in ['up', 'down']:
        return jsonify({'error': 'Invalid data'}), 400

    ensure_user(user_id)
    msg = Message.query.get(message_id)
    if not msg:
        return jsonify({'error': 'Message not found'}), 404

    # 기존 투표 조회
    existing_vote = Vote.query.filter_by(message_id=message_id, user_id=user_id).first()

    current_status = None # 'up', 'down', or None

    if existing_vote:
        if existing_vote.vote_type == vote_type:
            # Case 1: 같은 버튼 클릭 -> 투표 취소 (Toggle Off)
            db.session.delete(existing_vote)
            if vote_type == 'up':
                msg.likes = max(0, msg.likes - 1)
            else:
                msg.dislikes = max(0, msg.dislikes - 1)
            current_status = None
        else:
            # Case 2: 다른 버튼 클릭 -> 투표 변경 (Switch)
            # 기존꺼 취소
            if existing_vote.vote_type == 'up':
                msg.likes = max(0, msg.likes - 1)
            else:
                msg.dislikes = max(0, msg.dislikes - 1)

            # 새꺼 반영
            existing_vote.vote_type = vote_type
            if vote_type == 'up':
                msg.likes += 1
            else:
                msg.dislikes += 1
            current_status = vote_type
    else:
        # Case 3: 신규 투표 (New)
        new_vote = Vote(message_id=message_id, user_id=user_id, vote_type=vote_type)
        db.session.add(new_vote)
        if vote_type == 'up':
            msg.likes += 1
        else:
            msg.dislikes += 1
        current_status = vote_type

    db.session.commit()

    return jsonify({
        'likes': msg.likes,
        'dislikes': msg.dislikes,
        'userVote': current_status
    })

@app.route('/api/messages/<msg_id>/save', methods=['POST'])
def save_message(msg_id):
    """메시지 저장 (스크랩/북마크)"""
    data = request.json or {}
    user_id = data.get('userId', 'anonymous')

    msg = Message.query.get(msg_id)
    if not msg:
        return jsonify({'error': 'Message not found'}), 404

    # 중복 저장 방지
    existing = SavedMessage.query.filter_by(user_id=user_id, message_id=msg_id).first()
    if existing:
        return jsonify({'error': 'Already saved', 'success': True}), 200

    ensure_user(user_id)
    saved = SavedMessage(user_id=user_id, message_id=msg_id)
    db.session.add(saved)
    db.session.commit()

    return jsonify({'success': True}), 201

@app.route('/api/messages/<msg_id>/save', methods=['DELETE'])
def unsave_message(msg_id):
    """메시지 저장 취소"""
    data = request.json or {}
    user_id = data.get('userId', 'anonymous')

    saved = SavedMessage.query.filter_by(user_id=user_id, message_id=msg_id).first()
    if not saved:
        return jsonify({'error': 'Not saved'}), 404

    db.session.delete(saved)
    db.session.commit()

    return jsonify({'success': True})


@app.route('/api/users/<user_id>/routes', methods=['GET'])
def get_user_routes(user_id):
    """사용자의 이동 기록 조회"""
    routes = Route.query.filter_by(user_id=user_id).order_by(Route.timestamp.desc()).limit(50).all()
    return jsonify([r.to_dict() for r in routes])

@app.route('/api/users/<user_id>/routes', methods=['POST'])
def save_user_route(user_id):
    """이동 기록 저장 및 통계 업데이트"""
    data = request.json
    if not data:
        return jsonify({'error': 'Missing data'}), 400

    ensure_user(user_id)
    user = User.query.get(user_id)

    distance = data.get('distance', 0)
    mode = data.get('mode', 'walking')

    # 통계 업데이트
    if mode == 'walking':
        user.dist_walking += distance
    elif mode == 'wheelchair':
        user.dist_wheelchair += distance

    user.total_distance += distance

    route = Route(
        user_id=user_id,
        distance=distance,
        duration=data.get('duration', 0),
        mode=mode,
        start_coords=data.get('startCoords', ''),
        end_coords=data.get('endCoords', ''),
        points_json=data.get('points', '')
    )
    db.session.add(route)
    db.session.commit()
    return jsonify(route.to_dict()), 201

@app.route('/api/trajectories', methods=['GET'])
def get_trajectories():
    """지도 범위 내 집단지성 궤적 조회 (익명 궤적 노출)"""
    bounds = request.args.get('bounds', '') # "minLon,minLat,maxLon,maxLat"

    query = Route.query

    # 실서비스에서는 공간 쿼리(Spatial Query)를 사용해야 함
    # 데모용으로 최신 100개의 궤적을 반환하며,
    # 밀집도 시각화를 위해 랜덤하게 userCount를 부여 (실제로는 경로 중첩 계산 필요)
    import random
    routes = query.order_by(Route.timestamp.desc()).limit(100).all()

    result = []
    for r in routes:
        d = r.to_dict()
        d['userCount'] = random.randint(1, 25) # 시각화 테스트용 랜덤 값
        result.append(d)

    return jsonify(result)

# ========================================
# [NEW] 관리자 DB 조회 페이지
# ========================================
ADMIN_SECRET_KEY = os.environ.get('ADMIN_KEY', 'balgil_admin_2024')

@app.route('/admin/db')
def admin_db():
    """간단한 DB 조회 관리자 페이지 (페이지네이션 지원)"""
    key = request.args.get('key')
    if key != ADMIN_SECRET_KEY:
        return "Access Denied. Use ?key=YOUR_KEY", 403

    # 페이지네이션
    page = request.args.get('page', 1, type=int)
    per_page = 50

    # 총 개수 조회
    total_routes = Route.query.count()
    total_users = User.query.count()
    total_messages = Message.query.count()

    # 페이지별 데이터 조회
    routes = Route.query.order_by(Route.timestamp.desc()).offset((page - 1) * per_page).limit(per_page).all()
    users = User.query.order_by(User.created_at.desc()).limit(20).all()
    messages = Message.query.order_by(Message.timestamp.desc()).limit(30).all()

    # UTC → KST 변환 (+9시간)
    for r in routes:
        r.timestamp_kst = r.timestamp + timedelta(hours=9) if r.timestamp else None
    for u in users:
        u.created_at_kst = u.created_at + timedelta(hours=9) if u.created_at else None
    for m in messages:
        m.timestamp_kst = m.timestamp + timedelta(hours=9) if m.timestamp else None

    # 총 페이지 수 계산
    total_pages = (total_routes + per_page - 1) // per_page if total_routes > 0 else 1

    return render_template('admin_db.html',
                           routes=routes,
                           users=users,
                           messages=messages,
                           page=page,
                           total_pages=total_pages,
                           total_routes=total_routes,
                           total_users=total_users,
                           total_messages=total_messages,
                           key=key)

# ========================================
# 데이터베이스 테이블 자동 생성 (Gunicorn 호환)
# ========================================
with app.app_context():
    db.create_all()
    print(f"Database initialized: {DATABASE_URL}")

# ========================================
# 서버 시작 (로컬 개발용)
# ========================================
if __name__ == "__main__":
    print(f"🚀 Serving at http://localhost:{PORT}")
    print(f"📍 Kakao REST API Proxy Active")
    print(f"💬 Message API Active")
    print(f"📝 Comment API Active")
    app.run(host='0.0.0.0', port=PORT, debug=True)
