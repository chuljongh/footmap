from flask import Flask, request, jsonify, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
import urllib.request
import urllib.parse
import os
from datetime import datetime

# ========================================
# 환경 설정 (자동 전환 전략)
# ========================================
# 개발: 그냥 실행 → SQLite / 배포: FLASK_ENV=production → PostgreSQL
if os.environ.get('FLASK_ENV') == 'production':
    DATABASE_URL = os.environ.get('DATABASE_URL', 'sqlite:///balgil.db')
else:
    DATABASE_URL = 'sqlite:///balgil.db'

app = Flask(__name__, static_folder='.', static_url_path='')
app.config['SQLALCHEMY_DATABASE_URI'] = DATABASE_URL
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
CORS(app)

db = SQLAlchemy(app)

PORT = 8000
KAKAO_REST_API_KEY = "63106d5c2ee3c16a39a6dfb41960da8a"

# ========================================
# 데이터베이스 모델
# ========================================
class User(db.Model):
    """사용자 정보 및 활동 통계"""
    id = db.Column(db.String(100), primary_key=True) # 닉네임을 ID로 사용 (현재 정책 유지)
    profile_img = db.Column(db.Text) # Base64 또는 URL
    points = db.Column(db.Integer, default=0)
    total_distance = db.Column(db.Float, default=0.0) # 누적 이동 거리 (km)
    bio = db.Column(db.String(200)) # 자기소개
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'profileImg': self.profile_img,
            'points': self.points,
            'totalDistance': self.total_distance,
            'bio': self.bio,
            'createdAt': int(self.created_at.timestamp() * 1000)
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
    timestamp = db.Column(db.DateTime, default=datetime.utcnow, index=True)
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
            'timestamp': int(self.timestamp.timestamp() * 1000),
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
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'messageId': self.message_id,
            'userId': self.user_id,
            'text': self.text,
            'timestamp': int(self.timestamp.timestamp() * 1000)
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
    timestamp = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    
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
            'timestamp': int(self.timestamp.timestamp() * 1000)
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

@app.route('/api/messages/<msg_id>/vote', methods=['POST'])
def vote_message(msg_id):
    """좋아요/싫어요 투표"""
    data = request.json
    vote_type = data.get('type')  # 'up' or 'down'
    user_id = data.get('userId', 'anonymous')
    
    if vote_type not in ['up', 'down']:
        return jsonify({'error': 'Invalid vote type'}), 400
    
    msg = Message.query.get(msg_id)
    if not msg:
        return jsonify({'error': 'Message not found'}), 404
    
    # 기존 투표 확인
    existing_vote = Vote.query.filter_by(message_id=msg_id, user_id=user_id).first()
    
    if existing_vote:
        if existing_vote.vote_type == vote_type:
            return jsonify({'error': 'Already voted', 'likes': msg.likes, 'dislikes': msg.dislikes}), 400
        
        # 반대 투표로 변경
        if existing_vote.vote_type == 'up':
            msg.likes -= 1
        else:
            msg.dislikes -= 1
        existing_vote.vote_type = vote_type
    else:
        # 새 투표
        vote = Vote(message_id=msg_id, user_id=user_id, vote_type=vote_type)
        db.session.add(vote)
    
    # 새 투표 반영
    if vote_type == 'up':
        msg.likes += 1
    else:
        msg.dislikes += 1
    
    db.session.commit()
    return jsonify({'success': True, 'likes': msg.likes, 'dislikes': msg.dislikes})

# ========================================
# 댓글 API
# ========================================
@app.route('/api/messages/<msg_id>/detail', methods=['GET'])
def get_message_detail(msg_id):
    """메시지 상세 조회 (댓글 포함)"""
    msg = Message.query.get(msg_id)
    if not msg:
        return jsonify({'error': 'Message not found'}), 404
    return jsonify(msg.to_dict(include_comments=True))

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

@app.route('/api/users/<user_id>/routes', methods=['GET'])
def get_user_routes(user_id):
    """사용자의 이동 기록 조회"""
    routes = Route.query.filter_by(user_id=user_id).order_by(Route.timestamp.desc()).limit(50).all()
    return jsonify([r.to_dict() for r in routes])

@app.route('/api/users/<user_id>/routes', methods=['POST'])
def save_user_route(user_id):
    """이동 기록 저장"""
    data = request.json
    if not data:
        return jsonify({'error': 'Missing data'}), 400
    
    ensure_user(user_id)
    
    route = Route(
        user_id=user_id,
        distance=data.get('distance', 0),
        duration=data.get('duration', 0),
        mode=data.get('mode', 'pedestrian'),
        start_coords=data.get('startCoords', ''),
        end_coords=data.get('endCoords', ''),
        points_json=data.get('points', '') # 새 스키마 대응
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
# 서버 시작
# ========================================
if __name__ == "__main__":
    with app.app_context():
        db.create_all()  # DB 테이블 자동 생성
        print(f"Database initialized: {DATABASE_URL}")
    
    print(f"🚀 Serving at http://localhost:{PORT}")
    print(f"📍 Kakao REST API Proxy Active")
    print(f"💬 Message API Active")
    print(f"📝 Comment API Active")
    app.run(host='0.0.0.0', port=PORT, debug=True)
