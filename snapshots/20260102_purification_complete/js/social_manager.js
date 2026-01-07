// ========================================
// 소셜 기능 관리 (SocialManager) - V2
// ========================================
const SocialManager = {
    messages: [],
    messageLayer: null,
    isTalkMode: false, // 대화 모드 활성화 여부

    async init() {
        // [FIX] 중복 초기화 방지
        if (this._initialized) return;
        this._initialized = true;

        await this.loadMessages();
        this.bindEvents();
        this.initMessageLayer();

        // 지도 이동 시 말풍선 위치 업데이트
        if (AppState.map) {
            AppState.map.on('postrender', () => this.updateBubblePositions());
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
                return true;
            } else {
                throw new Error('Server error');
            }
        } catch (error) {
            console.error('SERVER_LOAD_FAIL', error);
            const saved = localStorage.getItem('balgil_messages');
            if (saved) {
                this.messages = JSON.parse(saved);
                console.warn('Loaded from cache due to error');
            } else {
                this.seedDummyData();
            }
            return false;
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
        document.getElementById('write-cancel-btn')?.addEventListener('click', () => this.closeWriteModal());
        document.getElementById('write-save-btn')?.addEventListener('click', () => this.saveNewMessage());
        document.getElementById('write-input')?.addEventListener('input', (e) => {
            const charEl = document.getElementById('curr-char');
            if (charEl) charEl.textContent = e.target.value.length;
        });

        // 태그 칩 이벤트 위임
        document.querySelector('.tag-chips-container')?.addEventListener('click', (e) => {
            const chip = e.target.closest('.tag-chip');
            if (chip && chip.dataset.tag) {
                this.addTag(chip.dataset.tag);
            }
        });

        // 스레드 패널 닫기
        document.getElementById('close-thread-btn')?.addEventListener('click', () => this.closeThreadPanel());

        // 메시지 오버레이 이벤트 위임 (말풍선 액션 처리)
        document.getElementById('message-cards-container')?.addEventListener('click', (e) => {
            const target = e.target.closest('[data-action]');
            if (!target) return;

            const action = target.dataset.action;
            const msgId = target.dataset.msgId;

            switch (action) {
                case 'remove-card':
                    this.removeCard(target);
                    break;
                case 'open-thread':
                    this.openThreadPanel(msgId);
                    break;
                case 'like':
                    this.handleLike(msgId, target.dataset.type, target);
                    break;
                case 'delete':
                    this.handleDelete(msgId);
                    break;
            }
        });

        // 스레드 패널 이벤트 위임
        document.getElementById('thread-panel')?.addEventListener('click', (e) => {
            const target = e.target.closest('[data-action]');
            if (!target) return;

            const action = target.dataset.action;
            const msgId = target.dataset.msgId;

            switch (action) {
                case 'open-thread':
                    this.openThreadPanel(msgId);
                    break;
                case 'like':
                    this.handleLike(msgId, target.dataset.type, target);
                    break;
                case 'share':
                    this.handleShare(msgId, target);
                    break;
                case 'edit':
                    this.handleEdit(msgId);
                    break;
                case 'delete':
                    this.handleDelete(msgId);
                    break;
            }
        });
    },

    // ========================================
    // 대화 모드 (Talk Mode) 로직
    // ========================================
    async openTalkMode() {
        this.isTalkMode = true;
        const overlay = document.getElementById('message-overlay');
        if (overlay) {
            overlay.classList.remove('hidden');
        }
        await this.showNearbyMessages();

        // 외부 클릭 감지 시작 (0ms 지연으로 현재 클릭 이벤트 전파 방지)
        setTimeout(() => {
            document.addEventListener('click', this.handleOutsideClick);
        }, 0);
    },

    // 외부 클릭 핸들러 (Arrow function for binding)
    handleOutsideClick: (e) => {
        const overlay = document.getElementById('message-overlay');
        const chatBtn = document.getElementById('chat-btn');

        // 오버레이 내부나 대화 버튼을 클릭한 게 아니면 닫기
        // [FIX] 버튼 삭제 시 (isConnected: false) 로직이 닫히는 것을 방지
        if (!e.target.isConnected) return;

        if (overlay && !overlay.contains(e.target) && chatBtn && !chatBtn.contains(e.target)) {
            SocialManager.closeTalkMode();
        }
    },

    closeTalkMode() {
        this.isTalkMode = false;
        const overlay = document.getElementById('message-overlay');
        if (overlay) {
            overlay.classList.add('hidden');
            overlay.classList.add('pointer-events-none');
            overlay.classList.remove('pointer-events-auto');
            overlay.onclick = null;
        }
        // [FIX] 컨테이너 초기화 (다음 오픈 시 새로운 내용 표시)
        const container = document.getElementById('message-cards-container');
        if (container) container.innerHTML = '';
        // 외부 클릭 감지 해제
        document.removeEventListener('click', this.handleOutsideClick);
    },

    // 글쓰기 모달 닫기 (DRY)
    closeWriteModal() {
        document.getElementById('write-modal')?.classList.add('hidden');
    },

    async showNearbyMessages(isRefresh = false) {
        if (!this.isTalkMode || !AppState.map) return;

        // 갱신인 경우 데이터 다시 로드 안함 (깜빡임 방지), 최초 오픈시에만 로드
        if (!isRefresh) {
            const success = await this.loadMessages();
            if (!success && this.messages.length === 0) {
                // Fetch failed AND no cache
                const container = document.getElementById('message-cards-container');
                if (container) {
                    container.innerHTML = '<div class="empty-state-text">네트워크 연결을 확인해주세요.</div>';
                }
                return;
            } else if (!success) {
                // Fetch failed but have cache -> Toast or console warning
                // For now, silent fallback or maybe a small indicator?
                // Let's just proceed with cached data.
            }
        }

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
        this.renderMessageCards(finalMessages);
    },

    renderMessageCards(messages) {
        const container = document.getElementById('message-cards-container');
        const currentUser = AppState.userProfile?.nickname || '익명';

        if (messages.length === 0) {
            // [FIX] 이미 빈 상태 카드가 있으면 다시 렌더링하지 않음 (깜빡임 방지)
            if (container.querySelector('.empty-state-card')) return;
            container.innerHTML = '';

            // 메시지가 없을 때 안내 (랜덤 문구)
            const emptyPhrases = [
                "이 구역은 아직 미개척지입니다. 대장님의 첫 깃발을 꽂아주세요! 🚩",
                "이 건물의 접근 팁이나 지름길, 혹시 사장님만 알고 계신가요? 😎",
                "사장님의 한 줄 팁이, 뒤따르는 동료에게는 10분의 휴식이 됩니다. ☕",
                "주차장에 각 동 안내가 없나요? 엘리베이터 찾기가 지랄같나요? 첫 번째 제보를 기다립니다. 📢",
                "텅 빈 게시판의 주인공이 되어주세요. 첫 기록은 '베스트'로 고정됩니다. 📌"
            ];
            const randomPhrase = emptyPhrases[Math.floor(Math.random() * emptyPhrases.length)];

            // [DOM 생성 방식] 이벤트 핸들링 보장을 위해 createElement 사용
            const msgCard = document.createElement('div');
            msgCard.className = 'message-card bubble-card empty-state-card';
            msgCard.innerHTML = `
                <div class="empty-state-text">
                    ${randomPhrase}
                </div>
            `;

            // 카드 클릭 시 닫기
            msgCard.addEventListener('click', (e) => {
                e.stopPropagation(); // 오버레이로의 전파는 막고 직접 닫음 (중복 호출 방지)
                this.closeTalkMode();
            });

            container.appendChild(msgCard);

            // 오버레이 설정
            const overlay = document.getElementById('message-overlay');
            if (overlay) {
                overlay.classList.remove('pointer-events-none');
                overlay.classList.add('pointer-events-auto');
                overlay.classList.remove('bg-transparent');
                overlay.classList.add('bg-touchable');
                // 기존 리스너 제거 후 새로 추가 (중복 방지)
                overlay.onclick = null;
                overlay.onclick = (e) => {
                    if (e.target === overlay || e.target === container) {
                        this.closeTalkMode();
                    }
                };
            }

            this.updateBubblePositions();
            return;
        }

        // 메시지가 있을 때: 오버레이 배경 클릭 무시
        const overlay = document.getElementById('message-overlay');
        if (overlay) {
            overlay.classList.add('pointer-events-none');
            overlay.classList.remove('pointer-events-auto');
            overlay.classList.add('bg-transparent');
            overlay.classList.remove('bg-touchable');
            overlay.onclick = null;
        }

        messages.forEach(msg => {
            const isOwner = msg.userId === currentUser;
            const card = document.createElement('div');
            card.className = 'speech-bubble'; // Unified class
            card.setAttribute('data-id', msg.id);
            // msg.coords가 있으면 위치 지정에 사용될 수 있지만, 현재는 overlay 내에서 위치잡는 로직이 updateBubblePositions에 있음.

            const dateStr = new Date(msg.timestamp).toLocaleDateString();

            card.innerHTML = `
                <button class="close-bubble" data-action="remove-card">✕</button>
                
                <div class="bubble-content" data-action="open-thread" data-msg-id="${msg.id}">
                    ${msg.tags ? `<div class="bubble-tags">${msg.tags}</div>` : ''}
                    <div class="bubble-text">${msg.text}</div>
                    <div class="bubble-meta">
                        <span class="bubble-author">${msg.userId}</span>
                        <span>${dateStr}</span>
                    </div>
                </div>

                <div class="bubble-actions">
                    <button data-action="like" data-msg-id="${msg.id}" data-type="up">👍 ${msg.likes || 0}</button>
                    <button data-action="like" data-msg-id="${msg.id}" data-type="down">👎 ${msg.dislikes || 0}</button>
                    ${isOwner ? `
                        <button data-action="delete" data-msg-id="${msg.id}">🗑️</button>
                    ` : ''}
                </div>
            `;
            container.appendChild(card);
        });

        this.updateBubblePositions();
    },

    removeCard(btn) {
        const card = btn.closest('.speech-bubble');
        if (card) card.remove();
        this.updateBubblePositions();
    },

    // ========================================
    // 말풍선 위치 업데이트 (지도 좌표 기준)
    // ========================================
    updateBubblePositions() {
        if (!this.isTalkMode || !AppState.map) return;

        const bubbles = document.querySelectorAll('.speech-bubble');
        bubbles.forEach(bubble => {
            const msgId = bubble.getAttribute('data-id');
            const msg = this.messages.find(m => m.id === msgId);
            if (!msg || !msg.coords) return;

            const mapPixel = AppState.map.getPixelFromCoordinate(ol.proj.fromLonLat(msg.coords));
            if (!mapPixel) {
                bubble.classList.add('hidden');
                return;
            }

            bubble.classList.remove('hidden');
            bubble.classList.add('pointer-events-auto');

            // --- Hybrid Positioning Logic (No Tails) ---
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            const bubbleWidth = bubble.offsetWidth || 300;
            const bubbleHeight = bubble.offsetHeight || 100;
            const margin = viewportWidth * Config.VIEWPORT_MARGIN;
            const isMobile = viewportWidth < Config.BREAKPOINT_MOBILE;

            let bubbleLeft, bubbleTop;

            if (isMobile) {
                // --- MOBILE: Top-Center Mode ---
                bubbleLeft = mapPixel[0] - bubbleWidth / 2;
                bubbleTop = mapPixel[1] - bubbleHeight - Config.BUBBLE_OFFSET_TOP;

                // Clamp X to viewport
                const maxLeft = viewportWidth - margin - bubbleWidth;
                const minLeft = margin;
                if (bubbleLeft < minLeft) bubbleLeft = minLeft;
                if (bubbleLeft > maxLeft) bubbleLeft = maxLeft;

                // Clamp Y (Top)
                if (bubbleTop < Config.MIN_BUBBLE_TOP) bubbleTop = Config.MIN_BUBBLE_TOP;

            } else {
                // --- DESKTOP: Left/Right Mode ---
                const maxLeft = viewportWidth - margin - bubbleWidth;
                const minLeft = margin;

                if (mapPixel[0] < viewportWidth / 2) {
                    bubbleLeft = mapPixel[0] + Config.BUBBLE_OFFSET_SIDE;
                } else {
                    bubbleLeft = mapPixel[0] - bubbleWidth - Config.BUBBLE_OFFSET_SIDE;
                }

                // Clamp X
                if (bubbleLeft < minLeft) bubbleLeft = minLeft;
                if (bubbleLeft > maxLeft) bubbleLeft = maxLeft;

                bubbleTop = mapPixel[1] - bubbleHeight - Config.BUBBLE_OFFSET_TOP;
            }

            // [NEW] Clamp Y (Bottom) - 하단 바와 겹치지 않도록
            const maxTop = viewportHeight - Config.BOTTOM_BAR_HEIGHT - bubbleHeight - margin;
            if (bubbleTop > maxTop) bubbleTop = maxTop;

            // [REFACTORED] CSS 변수로 좌표 전달 (Inline Style 제거)
            bubble.style.setProperty('--bubble-x', `${bubbleLeft}px`);
            bubble.style.setProperty('--bubble-y', `${bubbleTop}px`);
        });
    },

    // ========================================
    // 댓글 & 상세 보기
    // ========================================
    async expandCard(msgId) {
        const card = document.querySelector(`.message-card[data-id="${msgId}"]`);
        if (!card) return;

        const commentsDiv = card.querySelector('.card-comments');
        const isHidden = commentsDiv.classList.contains('hidden');

        if (isHidden) {
            commentsDiv.classList.remove('hidden');
            card.classList.add('expanded');
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
            card.classList.remove('expanded');
        }

        // 위치 재조정 (카드가 길어지므로)
        setTimeout(() => this.updateBubblePositions(), 50);
    },

    renderComments(msgId, comments) {
        const list = document.querySelector(`.message-card[data-id="${msgId}"] .comments-list`);
        if (!list) return;

        if (comments.length === 0) {
            list.innerHTML = '<div class="empty-comments">첫 번째 댓글을 남겨보세요! ✍️</div>';
            return;
        }

        list.innerHTML = comments.map(c => `
            <div class="comment-item">
                <div class="comment-header">
                    <span class="comment-user">${c.userId}</span>
                    <span class="comment-time">${new Date(c.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div class="comment-text">${c.text}</div>
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
            try {
                const response = await fetch(`/api/messages/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: AppState.userProfile?.nickname, text: newText })
                });

                if (!response.ok) throw new Error('Failed to update message');

                this.showNearbyMessages(true);
            } catch (error) {
                console.error('Error updating message:', error);
                alert('메시지 수정에 실패했습니다.');
            }
        }
    },

    async handleDelete(id) {
        if (confirm('삭제하시겠습니까?')) {
            try {
                const response = await fetch(`/api/messages/${id}`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: AppState.userProfile?.nickname })
                });

                if (!response.ok) throw new Error('Failed to delete message');

                this.showNearbyMessages(true);
            } catch (error) {
                console.error('Error deleting message:', error);
                alert('메시지 삭제에 실패했습니다.');
            }
        }
    },

    async showWriteModal() {
        // [수정] 현위치가 없더라도 목적지(검색 결과)가 있으면 작성 가능하게 변경
        let targetCoords = (AppState.destination && AppState.destination.coords)
            ? AppState.destination.coords
            : AppState.currentPosition;

        if (!targetCoords) {
            return alert('위치 확인이 안되고 있어요. 주소를 검색하시면 대화를 작성하실 수 있어요');
        }

        const titleEl = document.getElementById('write-modal-title');
        if (titleEl) {
            titleEl.textContent = '글 남기기 : 📍 위치 확인 중...';
        }

        // 입력값 초기화
        const input = document.getElementById('write-input');
        const tagInput = document.getElementById('write-tags');
        if (input) input.value = '';
        if (tagInput) tagInput.value = '';
        const currCharEl = document.getElementById('curr-char');
        if (currCharEl) currCharEl.textContent = '0';

        document.getElementById('write-modal')?.classList.remove('hidden');

        // [중요] 즉시 포커스
        setTimeout(() => {
            if (input) input.focus();
        }, 100);

        // 주소 가져오기 (비동기)
        try {
            const manager = window.MapManager || MapManager;
            if (manager && typeof manager.getAddressFromCoords === 'function') {
                const address = await manager.getAddressFromCoords(targetCoords);
                if (titleEl) titleEl.textContent = `글 남기기 : 📍 ${address}`;
            } else {
                throw new Error('MapManager not ready');
            }
        } catch (e) {
            console.error('Address fetch failed:', e);
            if (titleEl) {
                titleEl.textContent = `글 남기기 : 📍 (${targetCoords[1].toFixed(5)}, ${targetCoords[0].toFixed(5)})`;
            }
        }
    },

    // 추천 태그 추가
    addTag(tagName) {
        const tagInput = document.getElementById('write-tags');
        if (!tagInput) return;

        let currentTags = tagInput.value.trim();
        if (currentTags.includes(tagName)) return; // 중복 방지

        if (currentTags) {
            tagInput.value = currentTags + ' ' + tagName;
        } else {
            tagInput.value = tagName;
        }

        // 시각적 효과
        tagInput.classList.add('pulse');
        setTimeout(() => tagInput.classList.remove('pulse'), 300);
    },

    // ========================================
    // 스레드 패널 (Thread Detail Panel)
    // ========================================
    openThreadPanel(messageId) {
        const panel = document.getElementById('thread-panel');
        if (!panel) return;

        // 선택된 메시지 찾기
        const msg = this.messages.find(m => m.id === messageId);
        if (!msg) return;

        // 같은 위치의 다른 메시지 찾기
        const nearbyMessages = this.messages.filter(m => {
            if (m.id === messageId || !m.coords || !msg.coords) return false;
            const dist = this.calculateDistance(msg.coords, m.coords);
            return dist < Config.NEARBY_MESSAGE_DISTANCE;
        });

        // 메인 메시지 렌더링
        const mainContainer = document.getElementById('thread-main-message');
        const currentUser = AppState.userProfile?.nickname || '익명';
        const isOwner = msg.userId === currentUser;
        const dateStr = new Date(msg.timestamp).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' });

        mainContainer.innerHTML = `
            <div class="msg-text">${msg.text}</div>
            ${msg.tags ? `<div class="msg-tags">${msg.tags}</div>` : ''}
            <div class="msg-meta">
                <span>by ${msg.userId}</span>
                <span>${dateStr}</span>
            </div>
            <div class="msg-actions">
                <button data-action="like" data-msg-id="${msg.id}" data-type="up">👍 ${msg.likes || 0}</button>
                <button data-action="like" data-msg-id="${msg.id}" data-type="down">👎 ${msg.dislikes || 0}</button>
                <button data-action="share" data-msg-id="${msg.id}">🔗 ${msg.shares || 0}</button>
                ${isOwner ? `
                    <button data-action="edit" data-msg-id="${msg.id}">✏️</button>
                    <button data-action="delete" data-msg-id="${msg.id}">🗑️</button>
                ` : ''}
            </div>
        `;

        // 근처 메시지 목록 렌더링
        const repliesContainer = document.getElementById('thread-replies-list');
        if (nearbyMessages.length === 0) {
            repliesContainer.innerHTML = '<div class="reply-item reply-empty">이 위치에 다른 대화가 없습니다.</div>';
        } else {
            repliesContainer.innerHTML = nearbyMessages.map(m => {
                const mDate = new Date(m.timestamp).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' });
                return `
                    <div class="reply-item" data-action="open-thread" data-msg-id="${m.id}">
                        <div class="reply-line"></div>
                        <div class="reply-content">
                            <div class="reply-text">${m.text}</div>
                            <div class="reply-meta">
                                <span>by ${m.userId}</span>
                                <span>${mDate}</span>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // 패널 열기
        panel.classList.add('open');
    },

    closeThreadPanel() {
        const panel = document.getElementById('thread-panel');
        if (panel) panel.classList.remove('open');
    },

    // 두 좌표 사이 거리 계산 (미터)
    calculateDistance(coord1, coord2) {
        const R = 6371000; // 지구 반지름 (미터)
        const lat1 = coord1[1] * Math.PI / 180;
        const lat2 = coord2[1] * Math.PI / 180;
        const deltaLat = (coord2[1] - coord1[1]) * Math.PI / 180;
        const deltaLon = (coord2[0] - coord1[0]) * Math.PI / 180;

        const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c;
    },

    // expandCard → openThreadPanel 연결 (기존 호환)
    expandCard(messageId) {
        this.openThreadPanel(messageId);
    },

    async saveNewMessage() {
        const text = document.getElementById('write-input')?.value || '';
        const tagInput = document.getElementById('write-tags');
        const tags = tagInput ? tagInput.value : '';

        let targetCoords = (AppState.destination && AppState.destination.coords)
            ? AppState.destination.coords
            : AppState.currentPosition;

        if (!targetCoords) return alert('전송할 위치 정보가 없습니다.');

        try {
            const response = await fetch('/api/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: AppState.userProfile?.nickname || '익명',
                    text: text,
                    tags: tags,
                    coords: targetCoords
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const newMessage = await response.json();
            this.messages.unshift(newMessage);
            this.showNearbyMessages(); // 지도 갱신

            // 성공 처리
            this.closeWriteModal();
            this.showToast('📍 메시지가 남겨졌습니다!');
        } catch (e) {
            console.error(e);
            alert('저장 실패');
        }
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
                    fill: new ol.style.Fill({ color: Config.COLORS.SOCIAL_MARKER }),
                    stroke: new ol.style.Stroke({ color: Config.COLORS.WHITE, width: 2 })
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

window.SocialManager = SocialManager;
