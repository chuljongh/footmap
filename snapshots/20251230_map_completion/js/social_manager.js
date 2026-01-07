// ========================================
// 소셜 기능 관리 (SocialManager) - V2
// ========================================
const SocialManager = {
    messages: [],
    messageLayer: null,
    tailCanvas: null, // 말풍선 꼬리를 그릴 캔버스
    tailContext: null,
    isTalkMode: false, // 대화 모드 활성화 여부

    async init() {
        await this.loadMessages();
        this.bindEvents();
        this.initMessageLayer();
        this.initTailCanvas();

        // 지도 이동 시 꼬리 업데이트
        if (AppState.map) {
            AppState.map.on('postrender', () => this.updateTails());
            AppState.map.on('moveend', () => this.showNearbyMessages(true)); // 지도 이동 후 목록 갱신
        }
    },

    // ========================================
    // 서버 API 연동
    // ========================================
    async loadMessages() {
        try {
            const response = await fetch('/api/messages');
            if (response.ok) {
                this.messages = await response.json();
            } else {
                throw new Error('Server error');
            }
        } catch (error) {
            console.error('SERVER_LOAD_FAIL', error);
            const saved = localStorage.getItem('balgil_messages');
            if (saved) this.messages = JSON.parse(saved);
            else this.seedDummyData();
        }
    },

    seedDummyData() {
        const center = Config.DEFAULT_CENTER;
        this.messages = [
            { id: 'msg_1', userId: '산책왕', text: '여기 벚꽃 뷰가 진짜 대박이에요! 🌸', coords: [center[0] + 0.001, center[1] + 0.001], likes: 120, dislikes: 2, shares: 15, timestamp: Date.now() },
            { id: 'msg_2', userId: '커피중독', text: '이 근처 카페 라떼 맛집 추천좀요...', coords: [center[0] - 0.001, center[1] - 0.001], likes: 5, dislikes: 0, shares: 0, timestamp: Date.now() - 3600000 },
        ];
    },

    bindEvents() {
        // 대화 버튼 토글
        document.getElementById('chat-btn')?.addEventListener('click', () => {
            if (this.isTalkMode) {
                this.closeTalkMode();
            } else {
                this.openTalkMode();
            }
        });

        // 글쓰기 모달 관련
        document.getElementById('write-btn')?.addEventListener('click', () => this.showWriteModal());
        document.getElementById('write-cancel-btn')?.addEventListener('click', () => document.getElementById('write-modal').classList.add('hidden'));
        document.getElementById('write-save-btn')?.addEventListener('click', () => this.saveNewMessage());
        document.getElementById('write-input')?.addEventListener('input', (e) => document.getElementById('curr-char').textContent = e.target.value.length);
    },

    // ========================================
    // 대화 모드 (Talk Mode) 로직
    // ========================================
    async openTalkMode() {
        this.isTalkMode = true;
        document.getElementById('message-overlay').classList.remove('hidden');
        await this.showNearbyMessages();
    },

    closeTalkMode() {
        this.isTalkMode = false;
        document.getElementById('message-overlay').classList.add('hidden');
        if (this.tailCanvas) {
            this.tailContext.clearRect(0, 0, this.tailCanvas.width, this.tailCanvas.height);
        }
    },

    async showNearbyMessages(isRefresh = false) {
        if (!this.isTalkMode || !AppState.map) return;

        // 갱신인 경우 데이터 다시 로드 안함 (깜빡임 방지), 최초 오픈시에만 로드
        if (!isRefresh) await this.loadMessages();

        const extent = AppState.map.getView().calculateExtent(AppState.map.getSize());
        const [minX, minY, maxX, maxY] = ol.proj.transformExtent(extent, 'EPSG:3857', 'EPSG:4326');

        const visibleMessages = this.messages.filter(msg => {
            if (!msg.coords || msg.coords.length < 2) return false;
            const [x, y] = msg.coords;
            return x >= minX && x <= maxX && y >= minY && y <= maxY;
        });

        // 정렬: 좋아요 순 -> 시간 순
        visibleMessages.sort((a, b) => {
            if (b.likes !== a.likes) return b.likes - a.likes;
            return b.timestamp - a.timestamp;
        });

        // 반응형 개수 조절 (화면 높이에 따라 3개 또는 5개)
        const count = window.innerHeight > 800 ? 5 : 3;
        const finalMessages = visibleMessages.slice(0, count);

        // 셔플 로직 (닫기 버튼 누른 경우를 위해 필요한데, 지금은 리스트 렌더링이므로 고정)
        // 0.3초 지연 효과 (최초 로드 시에만)
        if (!isRefresh) {
            setTimeout(() => this.renderMessageCards(finalMessages), 300);
        } else {
            this.renderMessageCards(finalMessages);
        }
    },

    renderMessageCards(messages) {
        const container = document.getElementById('message-cards-container');
        container.innerHTML = '';
        const currentUser = AppState.userProfile?.nickname || '익명';

        if (messages.length === 0) {
            // 메시지가 없을 때 안내
            container.innerHTML = '<div style="color:white; text-align:center; padding:20px;">이 영역엔 대화가 없어요 🔇</div>';
            this.updateTails();
            return;
        }

        messages.forEach(msg => {
            const isOwner = msg.userId === currentUser;
            const card = document.createElement('div');
            card.className = 'message-card bubble-card'; // bubble-card 클래스 추가
            card.setAttribute('data-id', msg.id); // 꼬리 그리기용 ID 참조

            // 본문 줄임 (2줄 이상 시 ...) - CSS line-clamp 사용

            card.innerHTML = `
                <button class="card-close" onclick="SocialManager.removeCard(this)">✕</button>
                
                <div class="card-content" onclick="SocialManager.expandCard('${msg.id}')">
                    <span class="text-body">"${msg.text}"</span>
                    ${msg.edited ? '<small>(수정됨)</small>' : ''}
                </div>
                
                ${msg.tags ? `<div class="card-tags">${msg.tags.split(' ').map(t => `<span>${t}</span>`).join('')}</div>` : ''}

                <div class="card-meta">
                    <span class="card-user">by ${msg.userId} · ${new Date(msg.timestamp).toLocaleDateString()}</span>
                </div>
                
                <div class="card-actions">
                    <button class="card-btn" onclick="SocialManager.handleLike('${msg.id}', 'up', this)">
                        👍 <span>${msg.likes}</span>
                    </button>
                    <button class="card-btn" onclick="SocialManager.handleLike('${msg.id}', 'down', this)">
                        👎 <span>${msg.dislikes}</span>
                    </button>
                    <button class="card-btn" onclick="SocialManager.handleShare('${msg.id}', this)">
                        🔗 <span>${msg.shares}</span>
                    </button>
                    ${isOwner ? `
                        <button class="card-btn edit" onclick="SocialManager.handleEdit('${msg.id}')">✏️</button>
                        <button class="card-btn delete" onclick="SocialManager.handleDelete('${msg.id}')">🗑️</button>
                    ` : `
                        <button class="card-btn reply" onclick="SocialManager.expandCard('${msg.id}')">✏️</button>
                    `}
                </div>
                
                <!-- 댓글 영역 (초기엔 숨김) -->
                <div class="card-comments hidden" id="comments-${msg.id}">
                    <div class="comments-list"></div>
                    <div class="comment-input-area">
                        <input type="text" placeholder="댓글 달기..." class="comment-input">
                        <button onclick="SocialManager.addComment('${msg.id}')">등록</button>
                    </div>
                </div>
            `;
            container.appendChild(card);
        });

        this.updateTails();
    },

    removeCard(btn) {
        // UI에서만 제거 (일시적 닫기) -> 다음 순위 메시지가 와야 하는데 복잡하므로 일단 제거만
        const card = btn.closest('.message-card');
        card.remove();
        this.updateTails();
    },

    // ========================================
    // 말풍선 꼬리 그리기 (Canvas)
    // ========================================
    initTailCanvas() {
        this.tailCanvas = document.createElement('canvas');
        this.tailCanvas.id = 'tail-canvas';
        this.tailCanvas.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index:1400;';
        document.body.appendChild(this.tailCanvas);
        this.tailContext = this.tailCanvas.getContext('2d');

        window.addEventListener('resize', () => {
            this.tailCanvas.width = window.innerWidth;
            this.tailCanvas.height = window.innerHeight;
            this.updateTails();
        });
        this.tailCanvas.width = window.innerWidth;
        this.tailCanvas.height = window.innerHeight;
    },

    updateTails() {
        if (!this.isTalkMode || !this.tailCanvas || !AppState.map) return;

        const ctx = this.tailContext;
        ctx.clearRect(0, 0, this.tailCanvas.width, this.tailCanvas.height);

        // 지도 범위
        const mapSize = AppState.map.getSize();

        const cards = document.querySelectorAll('.message-card');
        cards.forEach(card => {
            const msgId = card.getAttribute('data-id');
            const msg = this.messages.find(m => m.id === msgId);
            if (!msg) return;

            // 카드 위치 (화면 좌표)
            const cardRect = card.getBoundingClientRect();
            const cardX = cardRect.left + cardRect.width / 2;
            const cardY = cardRect.top; // 카드 윗변 중앙

            // 지도 위치 (화면 좌표)
            const mapPixel = AppState.map.getPixelFromCoordinate(ol.proj.fromLonLat(msg.coords));
            if (!mapPixel) return;

            // 꼬리 그리기 (카드 위 -> 지도 좌표)
            ctx.beginPath();
            ctx.moveTo(cardX, cardY);
            ctx.lineTo(cardX, cardY - 10); // 살짝 위로
            ctx.lineTo(mapPixel[0], mapPixel[1]); // 지도 좌표로

            // 스타일 (만화 말풍선 꼬리 느낌)
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 3]); // 점선 효과
            ctx.stroke();

            // 끝점 원
            ctx.beginPath();
            ctx.arc(mapPixel[0], mapPixel[1], 4, 0, 2 * Math.PI);
            ctx.fillStyle = '#6366f1';
            ctx.fill();
        });
    },

    // ========================================
    // 댓글 & 상세 보기
    // ========================================
    async expandCard(msgId) {
        const card = document.querySelector(`.message-card[data-id="${msgId}"]`);
        if (!card) return;

        const commentsDiv = card.querySelector('.card-comments');
        if (commentsDiv.classList.contains('hidden')) {
            commentsDiv.classList.remove('hidden');
            // 댓글 로드
            try {
                const res = await fetch(`/api/messages/${msgId}/detail`);
                if (res.ok) {
                    const data = await res.json();
                    this.renderComments(msgId, data.comments || []);
                }
            } catch (e) { console.error(e); }
        } else {
            commentsDiv.classList.add('hidden');
        }
    },

    renderComments(msgId, comments) {
        const list = document.querySelector(`.message-card[data-id="${msgId}"] .comments-list`);
        if (!list) return;

        list.innerHTML = comments.map(c => `
            <div class="comment-item">
                <span class="comment-user">${c.userId}:</span>
                <span class="comment-text">${c.text}</span>
            </div>
        `).join('');
    },

    async addComment(msgId) {
        const card = document.querySelector(`.message-card[data-id="${msgId}"]`);
        const input = card.querySelector('.comment-input');
        const text = input.value.trim();
        if (!text) return;

        try {
            const res = await fetch(`/api/messages/${msgId}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: AppState.userProfile?.nickname || '익명',
                    text: text
                })
            });
            if (res.ok) {
                input.value = '';
                this.expandCard(msgId); // 재로딩
            }
        } catch (e) { alert('댓글 저장 실패'); }
    },

    // ========================================
    // 기본 액션 (좋아요/공유/수정/삭제)
    // ========================================
    async handleLike(id, type, btnElement) {
        const userId = AppState.userProfile?.nickname || 'anonymous';
        try {
            const response = await fetch(`/api/messages/${id}/vote`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, userId })
            });
            const result = await response.json();
            if (!response.ok) return alert(result.error || '오류');

            const span = btnElement.querySelector('span');
            if (span) span.textContent = type === 'up' ? result.likes : result.dislikes;
        } catch (e) { console.error(e); }
    },

    handleShare(id, btnElement) {
        const msg = this.messages.find(m => m.id === id);
        if (!msg) return;

        if (navigator.share) {
            navigator.share({ title: '발길맵 대화', text: msg.text });
        } else {
            navigator.clipboard.writeText(msg.text);
            alert('내용이 복사되었습니다.');
        }
    },

    async handleEdit(id) {
        const msg = this.messages.find(m => m.id === id);
        const newText = prompt('수정할 내용:', msg.text);
        if (newText && newText !== msg.text) {
            await fetch(`/api/messages/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: AppState.userProfile?.nickname, text: newText })
            });
            this.showNearbyMessages(true);
        }
    },

    async handleDelete(id) {
        if (confirm('삭제하시겠습니까?')) {
            await fetch(`/api/messages/${id}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: AppState.userProfile?.nickname })
            });
            this.showNearbyMessages(true);
        }
    },

    async showWriteModal() {
        if (!AppState.currentPosition) return alert('위치 확인 불가');

        // 명세: 검색된 주소(목적지)가 있다면 그곳, 없으면 현위치
        let targetCoords = AppState.currentPosition;
        let isDest = false;
        if (AppState.destination && AppState.destination.coords) {
            targetCoords = AppState.destination.coords;
            isDest = true;
        }

        const addressEl = document.getElementById('write-address-display');
        addressEl.textContent = '장소: 위치 확인 중...';

        document.getElementById('write-modal').classList.remove('hidden');

        // 주소 가져오기 (비동기)
        if (window.MapManager && MapManager.getAddressFromCoords) {
            const address = await MapManager.getAddressFromCoords(targetCoords);
            addressEl.textContent = `장소: ${address} ${isDest ? '(검색 위치)' : '(현위치)'}`;
        } else {
            addressEl.textContent = `장소: (${targetCoords[1].toFixed(5)}, ${targetCoords[0].toFixed(5)})`;
        }
    },

    async saveNewMessage() {
        const text = document.getElementById('write-input').value;
        const tagInput = document.getElementById('write-tags').value.trim();

        // 태그 미입력 시 기본값 처리
        const tags = tagInput ? tagInput : '#발길';

        if (!text) return;

        // 명세 3번: 검색 후 주소(목적지)가 있다면 해당 위치, 없으면 현위치
        let targetCoords = AppState.currentPosition;
        if (AppState.destination && AppState.destination.coords) {
            targetCoords = AppState.destination.coords;
        }

        await fetch('/api/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: AppState.userProfile?.nickname || '익명',
                text: text,
                tags: tags,
                coords: targetCoords
            })
        });
        document.getElementById('write-modal').classList.add('hidden');
        document.getElementById('write-input').value = ''; // 초기화
        document.getElementById('write-tags').value = ''; // 초기화
        this.showNearbyMessages(true);
    },

    // 명세 4번: 플로팅 모드 주소 매칭
    getBestMessageAt(targetCoords) {
        if (!this.messages) return null;

        // 1. 거리 50m 이내 메시지 찾기
        const nearby = this.messages.filter(m => {
            const dist = ol.sphere.getDistance(m.coords, targetCoords);
            return dist < 50;
        });

        if (nearby.length === 0) return null;

        // 2. 좋아요 순 정렬
        nearby.sort((a, b) => b.likes - a.likes);
        return nearby[0];
    },

    // 마커 레이어 (지도상 아이콘)
    initMessageLayer() {
        this.messageLayer = new ol.layer.Vector({
            source: new ol.source.Vector(),
            style: new ol.style.Style({
                image: new ol.style.Circle({
                    radius: 6,
                    fill: new ol.style.Fill({ color: '#6366f1' }),
                    stroke: new ol.style.Stroke({ color: '#fff', width: 2 })
                })
            }),
            zIndex: 50
        });
        if (AppState.map) AppState.map.addLayer(this.messageLayer);
        this.renderMessageMarkers();
    },

    renderMessageMarkers() {
        if (!this.messageLayer) return;
        const source = this.messageLayer.getSource();
        source.clear();
        this.messages.forEach(msg => {
            if (!msg.coords) return;
            source.addFeature(new ol.Feature({
                geometry: new ol.geom.Point(ol.proj.fromLonLat(msg.coords)),
                id: msg.id
            }));
        });
    }
};
