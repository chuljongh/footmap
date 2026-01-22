// ========================================
// 소셜 기능 관리 (SocialManager) - V2
// ========================================
const SocialManager = {
    messages: [],
    messageLayer: null,
    isTalkMode: false, // 대화 모드 활성화 여부
    elements: {}, // DOM 요소 캐시

    async init() {
        // [FIX] 중복 초기화 방지
        if (this._initialized) return;
        this._initialized = true;

        this.cacheElements();

        // 비차단(Non-blocking): 메시지 로드를 백그라운드로 처리
        this.loadMessages().then(() => {
            this.initMessageLayer();
            this.renderMessageMarkers();
        });
        this.bindEvents();

        // 지도 이동 시 말풍선 위치 업데이트
        if (AppState.map) {
            AppState.map.on('postrender', () => this.updateBubblePositions());
            AppState.map.on('moveend', () => this.showNearbyMessages(true)); // 지도 이동 후 목록 갱신
        }
    },

    cacheElements() {
        const ids = [
            'chat-btn', 'write-btn', 'write-modal', 'write-input', 'write-tags',
            'write-cancel-btn', 'write-save-btn', 'curr-char', 'close-thread-btn',
            'message-cards-container', 'message-overlay', 'thread-panel',
            'thread-content', 'thread-comment-input', 'thread-comment-submit',
            'write-modal-title', 'thread-place-name'
        ];
        ids.forEach(id => {
            this.elements[id] = document.getElementById(id);
        });
    },

    // ========================================
    // 서버 API 연동 -> MessageService 위임
    // ========================================
    async loadMessages() {
        this.messages = await MessageService.fetchMessages();
        return this.messages.length > 0;
    },

    bindEvents() {
        // 대화 버튼 토글
        this.elements['chat-btn']?.addEventListener('click', () => {
            if (this.isTalkMode) {
                this.closeTalkMode();
            } else {
                this.openTalkMode();
            }
        });

        // 글쓰기 모달 관련
        this.elements['write-btn']?.addEventListener('click', () => this.showWriteModal());
        this.elements['write-cancel-btn']?.addEventListener('click', () => this.closeWriteModal());
        this.elements['write-save-btn']?.addEventListener('click', () => this.saveNewMessage());
        this.elements['write-input']?.addEventListener('input', (e) => {
            const charEl = this.elements['curr-char'];
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
        this.elements['close-thread-btn']?.addEventListener('click', () => this.closeThreadPanel());

        // 메시지 오버레이 이벤트 위임 (말풍선 액션 처리)
        this.elements['message-cards-container']?.addEventListener('click', (e) => {
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
        this.elements['thread-panel']?.addEventListener('click', (e) => {
            const target = e.target.closest('[data-action]');
            if (!target) return;

            const action = target.dataset.action;
            const msgId = target.dataset.msgId;

            // [NEW] 댓글 버튼 클릭 시 입력창 표시
            if (action === 'focus-comment') {
                const inputBar = document.querySelector('.thread-input-bar');
                if (inputBar) inputBar.classList.remove('hidden');
            }

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
                case 'save':
                    this.handleSave(msgId);
                    break;
                case 'unsave':
                    this.handleUnsave(msgId);
                    break;
                case 'focus-comment':
                    this.elements['thread-comment-input']?.focus();
                    break;
            }
        });

        // 댓글 제출
        this.elements['thread-comment-submit']?.addEventListener('click', () => this.submitThreadComment());
        this.elements['thread-comment-input']?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.submitThreadComment();
        });
    },

    // ========================================
    // 대화 모드 (Talk Mode) 로직
    // ========================================
    async openTalkMode() {
        this.isTalkMode = true;
        const overlay = this.elements['message-overlay'];
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
        const overlay = SocialManager.elements['message-overlay'];
        const chatBtn = SocialManager.elements['chat-btn'];

        // 오버레이 내부나 대화 버튼을 클릭한 게 아니면 닫기
        if (!e.target.isConnected) return;

        if (overlay && !overlay.contains(e.target) && chatBtn && !chatBtn.contains(e.target)) {
            SocialManager.closeTalkMode();
        }
    },

    closeTalkMode() {
        this.isTalkMode = false;
        const overlay = this.elements['message-overlay'];
        if (overlay) {
            overlay.classList.add('hidden');
            overlay.classList.add('pointer-events-none');
            overlay.classList.remove('pointer-events-auto');
            overlay.onclick = null;
        }
        // [FIX] 컨테이너 초기화 (다음 오픈 시 새로운 내용 표시)
        const container = this.elements['message-cards-container'];
        if (container) container.innerHTML = '';
        // 외부 클릭 감지 해제
        document.removeEventListener('click', this.handleOutsideClick);
    },

    // 글쓰기 모달 닫기 (DRY)
    closeWriteModal() {
        this.elements['write-modal']?.classList.add('hidden');
    },

    async showNearbyMessages(isRefresh = false) {
        if (!this.isTalkMode || !AppState.map) return;

        // 갱신인 경우 데이터 다시 로드 안함 (깜빡임 방지), 최초 오픈시에만 로드
        if (!isRefresh) {
            await this.loadMessages();
            // [FIX] 데이터가 없어도 (빈 배열) 에러로 취급하지 않음.
            // renderMessageCards([])가 호출되어 '빈 상태 안내 카드'를 표시하도록 함.
        }

        let visibleMessages = [];

        // [PRIORITY 1] 목적지(검색/터치)가 설정된 경우: 반경 10m 이내 메시지
        if (AppState.destination && AppState.destination.coords) {
            const destCoords = AppState.destination.coords; // [Lon, Lat]
            visibleMessages = this.messages.filter(msg => {
                if (!msg.coords || msg.coords.length < 2) return false;
                const dist = this._getDistanceFromLatLonInM(
                    destCoords[1], destCoords[0],
                    msg.coords[1], msg.coords[0]
                );
                return dist <= 10; // 10m 이내
            });
        }
        // [PRIORITY 2] 목적지가 없는 경우: 현재 화면(Viewport) 내 메시지
        else {
            const extent = AppState.map.getView().calculateExtent(AppState.map.getSize());
            const [minX, minY, maxX, maxY] = ol.proj.transformExtent(extent, 'EPSG:3857', 'EPSG:4326');

            visibleMessages = this.messages.filter(msg => {
                if (!msg.coords || msg.coords.length < 2) return false;
                const [x, y] = msg.coords;
                return x >= minX && x <= maxX && y >= minY && y <= maxY;
            });
        }

        // 정렬: 좋아요 순 -> 시간 순
        visibleMessages.sort((a, b) => {
            if (b.likes !== a.likes) return b.likes - a.likes;
            return b.timestamp - a.timestamp;
        });

        // 반응형 개수 조절 (화면 높이에 따라 3개 또는 5개)
        const count = window.innerHeight > 800 ? 5 : 3;
        const finalMessages = visibleMessages.slice(0, count);

        this.renderMessageCards(finalMessages);
    },

    // [HELPER] 거리 계산 (Haversine Formula) - 미터 단위 반환
    _getDistanceFromLatLonInM(lat1, lon1, lat2, lon2) {
        const R = 6371e3; // 지구 반지름 (미터)
        const dLat = this._deg2rad(lat2 - lat1);
        const dLon = this._deg2rad(lon2 - lon1);
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this._deg2rad(lat1)) * Math.cos(this._deg2rad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    },

    _deg2rad(deg) {
        return deg * (Math.PI / 180);
    },

    renderMessageCards(messages) {
        const container = this.elements['message-cards-container'];
        const currentUserId = AppState.userId;

        if (messages.length === 0) {
            // [FIX] 이미 빈 상태 카드가 있으면 다시 렌더링하지 않음 (깜빡임 방지)
            if (container.querySelector('.empty-state-card')) return;
            container.innerHTML = '';

            // 메시지가 없을 때 안내 (랜덤 문구)
            const emptyPhrases = [
                "이 구역은 아직 미개척지입니다. 대장님의 첫 깃발을 꽂아주세요! 🚩",
                "이 건물 출입구는 어디인가요? 사장님의 제보를 기다립니다. 😎",
                "사장님의 한 줄 팁이, 뒤따르는 동료에게는 10분의 휴식이 됩니다. ☕",
                "주차장에 각 동 안내가 없나요? 엘리베이터 찾기가 지랄같나요? 📢",
                "텅 빈 게시판의 주인공이 되어주세요. 첫 기록은 '베스트'로 고정됩니다. 📌"
            ];
            const randomPhrase = emptyPhrases[Math.floor(Math.random() * emptyPhrases.length)];

            // [DOM 생성 방식] 이벤트 핸들링 보장을 위해 createElement 사용
            const msgCard = document.createElement('div');
            msgCard.className = 'speech-bubble empty-state-card'; // Use speech-bubble class for consistent style
            msgCard.innerHTML = `
                <button class="close-bubble" style="position:absolute;top:8px;right:8px;">✕</button>
                <div class="empty-state-text">
                    ${randomPhrase}
                </div>
            `;

            // X 버튼 클릭 이벤트
            msgCard.querySelector('.close-bubble').addEventListener('click', (e) => {
                e.stopPropagation();
                this.closeTalkMode();
            });

            // 카드 클릭 시 닫기
            msgCard.addEventListener('click', (e) => {
                e.stopPropagation();
                this.closeTalkMode();
            });

            container.appendChild(msgCard);

            // 오버레이 설정
            const overlay = this.elements['message-overlay'];
            if (overlay) {
                overlay.classList.remove('pointer-events-none');
                overlay.classList.add('pointer-events-auto');
                overlay.classList.remove('bg-transparent');
                overlay.classList.add('bg-touchable');
                overlay.onclick = null;
                overlay.onclick = (e) => {
                    if (e.target === overlay || e.target === container) {
                        this.closeTalkMode();
                    }
                };
            }

            // 빈 상태 카드는 중앙 혹은 상단에 배치
             // [Simple Layout for Empty Card]
             const viewportWidth = window.innerWidth;
             const viewportHeight = window.innerHeight;
             const width = 300; // Approx
             const height = 150; // Approx

             // Center of Screen
             const x = (viewportWidth - width) / 2;
             const y = (viewportHeight - height) / 3;

             msgCard.style.setProperty('--bubble-x', `${x}px`);
             msgCard.style.setProperty('--bubble-y', `${y}px`);

            return;
        }

        // 메시지가 있을 때: 오버레이 배경 클릭 무시
        const overlay = this.elements['message-overlay'];
        if (overlay) {
            overlay.classList.add('pointer-events-none');
            overlay.classList.remove('pointer-events-auto');
            overlay.classList.add('bg-transparent');
            overlay.classList.remove('bg-touchable');
            overlay.onclick = null;
        }

        container.innerHTML = '';
        messages.forEach(msg => {
            // const isOwner = msg.userId === currentUserId; // isOwner Unused for deletion now
            const card = document.createElement('div');
            card.className = 'speech-bubble';
            card.setAttribute('data-id', msg.id);

            const dateStr = new Date(msg.timestamp).toLocaleDateString();

            card.innerHTML = `
                <button class="close-bubble" data-action="remove-card">✕</button>

                <div class="bubble-content" data-action="open-thread" data-msg-id="${msg.id}">
                    ${msg.tags ? `<div class="bubble-tags">${Utils.sanitize(msg.tags)}</div>` : ''}
                    <div class="bubble-text">${Utils.sanitize(msg.text)}</div>
                    <div class="bubble-meta">
                        <span class="author-truncate">by ${Utils.sanitize(msg.nickname || msg.userId)}(${msg.userId.substring(0, 3)}...)</span>
                        <span>${dateStr}</span>
                    </div>
                </div>

                <div class="bubble-actions">
                    <button data-action="like" data-msg-id="${msg.id}" data-type="up">👍 ${msg.likes || 0}</button>
                    <button data-action="like" data-msg-id="${msg.id}" data-type="down">👎 ${msg.dislikes || 0}</button>
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
    // 말풍선 위치 업데이트 (충돌 회피 및 지능형 배치)
    // ========================================
    _layoutPending: false,
    updateBubblePositions() {
        if (!this.isTalkMode || !AppState.map || this._layoutPending) return;

        this._layoutPending = true;
        requestAnimationFrame(() => {
            this._performLayout();
            this._layoutPending = false;
        });
    },

    _performLayout() {
        const bubbleElements = Array.from(document.querySelectorAll('.speech-bubble:not(.empty-state-card)')); // Exclude empty card
        if (bubbleElements.length === 0) return;

        // 1. 수집 및 위도 기준 정렬 (안정적인 배치 순서 보장)
        const bubbleData = bubbleElements.map(el => {
            const msgId = el.getAttribute('data-id');
            const msg = this.messages.find(m => m.id === msgId);
            return { el, msg };
        })
            .filter(item => item.msg && item.msg.coords)
            .sort((a, b) => b.msg.coords[1] - a.msg.coords[1]); // 북쪽 -> 남쪽 순

        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const safeMargin = 20;
        const placedRects = [];

        bubbleData.forEach((item, index) => {
            const { el, msg } = item;
            const pixel = AppState.map.getPixelFromCoordinate(ol.proj.fromLonLat(msg.coords));

            if (!pixel) {
                el.classList.add('hidden');
                return;
            }

            // 2. 실측 또는 기본값 측정
            const width = el.offsetWidth || Config.BUBBLE_DEFAULT_WIDTH;
            const height = el.offsetHeight || Config.BUBBLE_DEFAULT_HEIGHT;

            // 3. 초기 위치 계산 (항상 상단 중앙 - 사용자 요청에 따라 PC 최적화 제외)
            let x = pixel[0] - (width / 2);
            let y = pixel[1] - height - Config.BUBBLE_OFFSET_TOP;
            const originalY = y;

            // 4. 충돌 회피 (이미 배치된 것들과 겹치면 아래로 밀어냄)
            let attempts = 0;
            let currentRect = { left: x, top: y, right: x + width, bottom: y + height };

            while (this._checkOverlap(currentRect, placedRects) && attempts < Config.MAX_PLACEMENT_ATTEMPTS) {
                currentRect.top += Config.BUBBLE_VERTICAL_SPACING;
                currentRect.bottom += Config.BUBBLE_VERTICAL_SPACING;
                attempts++;
            }

            // 5. 경계 처리 및 검증
            // 좌우 클램핑
            if (currentRect.left < safeMargin) {
                currentRect.left = safeMargin;
            } else if (currentRect.right > viewportWidth - safeMargin) {
                currentRect.left = viewportWidth - safeMargin - width;
            }

            // 상단 최소 여백
            if (currentRect.top < Config.MIN_BUBBLE_TOP) {
                currentRect.top = Config.MIN_BUBBLE_TOP;
            }

            // 하단 및 이동거리 검증
            const bottomLimit = viewportHeight - (Config.BOTTOM_BAR_HEIGHT + 20);
            const totalShift = currentRect.top - originalY;

            if (currentRect.top + height > bottomLimit || totalShift > Config.MAX_BUBBLE_SHIFT) {
                el.classList.add('hidden');
            } else {
                el.classList.remove('hidden');
                el.style.setProperty('--bubble-x', `${currentRect.left}px`);
                el.style.setProperty('--bubble-y', `${currentRect.top}px`);
                el.style.zIndex = 1000 + index; // 쌓임 순서 제어
                placedRects.push({ ...currentRect });
            }
        });
    },

    _checkOverlap(newRect, placedRects) {
        const margin = Config.COLLISION_MARGIN || 10;
        return placedRects.some(placed => {
            return !(
                newRect.right + margin < placed.left ||
                newRect.left - margin > placed.right ||
                newRect.bottom + margin < placed.top ||
                newRect.top - margin > placed.bottom
            );
        });
    },

    // ========================================
    // 댓글 & 상세 보기
    // ========================================
    async expandCard(msgId) {
        const card = document.querySelector(`.message-card[data-id="${msgId}"]`);
        if (!card) return;

        const commentsDiv = card.querySelector('.card-comments');
        if (!commentsDiv) return; // Guard
        const isHidden = commentsDiv.classList.contains('hidden');

        if (isHidden) {
            commentsDiv.classList.remove('hidden');
            card.classList.add('expanded');
            // 댓글 로드
            try {
                const data = await MessageService.fetchMessageDetail(msgId);
                this.renderComments(msgId, data.comments || []);
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
                    <span class="comment-user">${Utils.sanitize(c.nickname || c.userId)}</span>
                    <span class="comment-time">${new Date(c.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div class="comment-text">${Utils.sanitize(c.text)}</div>
            </div>
        `).join('');
    },

    async addComment(msgId) {
         // ... unchanged ...
    },

    // ========================================
    // 기본 액션 (좋아요/공유/수정/삭제)
    // ========================================
    async handleLike(id, type, btnElement) {
        const userId = AppState.userId;
        const msg = this.messages.find(m => m.id === id);
        if (!msg) return;

        // [Logic] Toggle & Mutually Exclusive
        const currentVote = msg.userVote; // 'up', 'down', or undefined
        const isSame = currentVote === type;

        // Optimistic Update Values
        let newLikes = msg.likes || 0;
        let newDislikes = msg.dislikes || 0;
        let nextVote = null;

        try {
            if (isSame) {
                // 1. Cancel Vote (Toggle Off)
                if (type === 'up') newLikes = Math.max(0, newLikes - 1);
                else newDislikes = Math.max(0, newDislikes - 1);

                nextVote = null;
                await MessageService.cancelVote(id, type); // Service implements atomic decrement logic if possible
            } else {
                // 2. Switch Vote or New Vote
                // If switching, decrement old one first
                if (currentVote) {
                    if (currentVote === 'up') newLikes = Math.max(0, newLikes - 1);
                    else newDislikes = Math.max(0, newDislikes - 1);

                    await MessageService.cancelVote(id, currentVote);
                }

                // Increment new one
                if (type === 'up') newLikes++;
                else newDislikes++;

                nextVote = type;
                await MessageService.vote(id, type, userId);
            }

            // Apply to Local State
            msg.likes = newLikes;
            msg.dislikes = newDislikes;
            msg.userVote = nextVote;

            // UI Update (All buttons for this msg)
            const allLikeBtns = document.querySelectorAll(`button[data-action="like"][data-msg-id="${id}"]`);
            allLikeBtns.forEach(btn => {
                const btnType = btn.dataset.type;
                const count = btnType === 'up' ? msg.likes : msg.dislikes;

                btn.innerHTML = btnType === 'up' ? `👍 ${count}` : `👎 ${count}`;

                // Toggle Active Class
                if (msg.userVote === btnType) {
                    btn.classList.add('active'); // CSS handles style
                    btn.style.opacity = '1';
                    btn.style.color = '#00d4aa'; // Force highlight just in case
                } else {
                    btn.classList.remove('active');
                    btn.style.opacity = '0.7';
                    btn.style.color = '';
                }
            });

        } catch (e) {
            console.error('Vote Failed:', e);
            Utils.showToast('투표 처리에 실패했습니다.');
            // Rollback (Optional, but good for UX)
        }
    },

    handleShare(id, btnElement) {
        const msg = this.messages.find(m => m.id === id);
        if (!msg) return;

        if (navigator.share) {
            navigator.share({ title: '발길맵 대화', text: msg.text });
        } else {
            navigator.clipboard.writeText(msg.text);
            Utils.showToast('내용이 복사되었습니다.');
        }
    },

    async handleEdit(id) {
        // [STUB] Edit not yet supported via Supabase client-side
        // Would require MessageService.updateMessage implementation
        Utils.showToast('수정 기능은 현재 점검 중입니다.');
    },

    async handleDelete(id) {
        // [STUB] Delete not yet supported via Supabase client-side
        // Would require MessageService.deleteMessage implementation
        if (confirm('삭제하시겠습니까?')) {
            Utils.showToast('삭제 기능은 현재 점검 중입니다.');
        }
    },

    async handleSave(id) {
        // [STUB] Save/Bookmark not yet implemented
        Utils.showToast('저장 기능은 현재 점검 중입니다.');
    },

    async handleUnsave(id) {
        // [STUB] Unsave/Unbookmark not yet implemented
        Utils.showToast('저장 취소 기능은 현재 점검 중입니다.');
    },

    _isSubmitting: false, // 중복 제출 방지 플래그

    async submitThreadComment() {
        if (this._isSubmitting) return; // 이미 제출 중이면 무시

        const input = this.elements['thread-comment-input'];
        const text = input?.value.trim();
        if (!text || !this.currentMessageId) return;

        this._isSubmitting = true; // 플래그 설정
        const userId = AppState.userId;
        try {
            // [FIX] Use MessageService directly for Android compatibility
            await MessageService.postComment(this.currentMessageId, userId, text);

            // 입력창 초기화 및 댓글 목록 새로고침
            input.value = '';
            this.loadComments(this.currentMessageId);
            Utils.showToast('댓글이 등록되었습니다.');
        } catch (error) {
            console.error('Error posting comment:', error);
            Utils.showToast('댓글 작성에 실패했습니다.');
        } finally {
            this._isSubmitting = false; // 플래그 해제
        }
    },

    async showWriteModal() {
        // [FIX] 대화 모드가 열려있다면 닫기
        if (this.isTalkMode) this.closeTalkMode();

        // [수정] 현위치가 없더라도 목적지(검색 결과)가 있으면 작성 가능하게 변경
        let targetCoords = (AppState.destination && AppState.destination.coords)
            ? AppState.destination.coords
            : AppState.currentPosition;

        if (!targetCoords) {
            return Utils.showToast('위치 확인이 안되고 있어요. 주소를 검색하시면 대화를 작성하실 수 있어요');
        }

        const titleEl = this.elements['write-modal-title'];
        if (titleEl) {
            titleEl.textContent = '글 남기기 : 📍 위치 확인 중...';
        }

        // 입력값 초기화
        const input = this.elements['write-input'];
        const tagInput = this.elements['write-tags'];
        if (input) input.value = '';
        if (tagInput) tagInput.value = '';
        const currCharEl = this.elements['curr-char'];
        if (currCharEl) currCharEl.textContent = '0';

        this.elements['write-modal']?.classList.remove('hidden');

        // [Refined] 플로팅 라벨 자동 숨김 설정
        this.setupLabelAutoFade(input, document.querySelector('label[for="write-input"]'));
        this.setupLabelAutoFade(tagInput, document.querySelector('label[for="write-tags"]'));

        // [중요] 즉시 포커스
        setTimeout(() => {
            if (input) {
                input.focus();
                // 포커싱 시 바로 타이머 동작 유도
                input.dispatchEvent(new Event('focus'));
            }
        }, 100);

        // 주소 가져오기 (우선: destination.name, 없으면 API 호출)
        try {
            // [FIX] 검색으로 설정한 목적지면 이미 주소/매장명이 있음
            if (AppState.destination && AppState.destination.name) {
                if (titleEl) titleEl.textContent = `글 남기기 : 📍 ${AppState.destination.name}`;
            } else {
                const manager = (typeof MapManager !== 'undefined') ? MapManager : null;
                if (manager && manager.map && typeof manager.getAddressFromCoords === 'function') {
                    const address = await manager.getAddressFromCoords(targetCoords);
                    if (titleEl) titleEl.textContent = `글 남기기 : 📍 ${address}`;
                } else {
                    throw new Error('MapManager not ready');
                }
            }
        } catch (e) {
            console.error('Address fetch failed:', e);
            if (titleEl) {
                titleEl.textContent = `글 남기기 : 📍 현재 위치`;
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

        // [NEW] 스크롤을 오른쪽 끝으로 이동하여 커서 위치 표시
        tagInput.focus();
        tagInput.scrollLeft = tagInput.scrollWidth;

        // 시각적 효과
        tagInput.classList.add('pulse');
        setTimeout(() => tagInput.classList.remove('pulse'), 300);
    },

    // ========================================
    // 스레드 패널 (Thread Detail Panel) - 3단 탭 시스템
    // ========================================
    currentMessageId: null,
    currentTab: 'comments',

    async openThreadPanel(messageId) {
        const panel = document.getElementById('thread-panel');
        if (!panel) return;

        this.currentMessageId = messageId;
        const msg = this.messages.find(m => m.id === messageId);
        if (!msg) return;

        // 장소 이름 업데이트 (주소 없으면 역지오코딩 시도)
        // 장소 이름 업데이트 (주소 없으면 역지오코딩 시도)
        const placeNameEl = this.elements['thread-place-name'];
        if (placeNameEl) {
            if (msg.address) {
                placeNameEl.textContent = '📍 ' + msg.address;
            } else {
                placeNameEl.textContent = '📍 위치 확인 중...';
                try {
                    const manager = (typeof MapManager !== 'undefined') ? MapManager : null;
                    if (manager && manager.map && typeof manager.getAddressFromCoords === 'function') {
                        const addr = await manager.getAddressFromCoords(msg.coords);
                        if (addr) {
                            placeNameEl.textContent = '📍 ' + addr;
                            // 캐시에 저장 (선택 사항)
                            msg.address = addr;
                        } else {
                            // API 성공했으나 주소 못 찾음
                            placeNameEl.textContent = '📍 지도 위 선택된 위치';
                        }
                    } else {
                        // MapManager 없음
                        placeNameEl.textContent = '📍 지도 위 선택된 위치';
                    }
                } catch (e) {
                    console.error('Address fetch failed:', e);
                    // API 에러 등 실패 시
                    placeNameEl.textContent = '📍 지도 위 선택된 위치';
                }
            }
        }

        // 탭 이벤트 바인딩
        this.bindTabEvents();

        // 기본 탭(댓글) 렌더링
        this.switchTab('comments');

        // [NEW] 입력창 초기화 (숨김)
        const inputBar = document.querySelector('.thread-input-bar');
        if (inputBar) inputBar.classList.add('hidden');

        // 패널 열기
        panel.classList.add('open');
    },

    bindTabEvents() {
        const tabBtns = document.querySelectorAll('.tab-btn');
        tabBtns.forEach(btn => {
            btn.onclick = () => {
                const tab = btn.dataset.tab;
                this.switchTab(tab);
            };
        });
    },

    switchTab(tabName) {
        this.currentTab = tabName;

        // 탭 버튼 활성화 상태 업데이트
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        // [FIX] 댓글 탭이 아니면 하단 입력창 숨김
        const inputBar = document.querySelector('.thread-input-bar');
        if (inputBar) {
            if (tabName !== 'comments') {
                inputBar.classList.add('hidden');
            }
            // 댓글 탭에서는 '댓글' 버튼을 눌러야만 표시되므로 여기서는 숨김 유지
        }

        // 컨텐츠 렌더링
        switch (tabName) {
            case 'comments':
                this.renderCommentsTab();
                break;
            case 'place':
                this.renderPlaceTab();
                break;
            case 'tags':
                this.renderTagsTab();
                break;
        }
    },

    async renderCommentsTab() {
        const msg = this.messages.find(m => m.id === this.currentMessageId);
        if (!msg) return;

        const container = document.getElementById('thread-content');
        const currentUser = AppState.userProfile?.nickname || '익명';
        const isOwner = msg.userId === currentUser;

        // 저장 상태 확인
        let isSaved = false;
        // API Call omitted for Android stability

        // [Simplified] 3-Icon Layout: Like, Dislike, Comment only
        const btnLike = `<button data-action="like" data-msg-id="${msg.id}" data-type="up" class="${msg.userVote === 'up' ? 'active' : ''}">👍 ${msg.likes || 0}</button>`;
        const btnDislike = `<button data-action="like" data-msg-id="${msg.id}" data-type="down" class="${msg.userVote === 'down' ? 'active' : ''}">👎 ${msg.dislikes || 0}</button>`;
        const btnComment = `<button data-action="focus-comment">💬 댓글</button>`;

        const actionButtons = `${btnLike}${btnDislike}${btnComment}`;

        container.innerHTML = `
            <div class="main-message-card">
                ${msg.tags ? `<div class="msg-tags">${msg.tags}</div>` : ''}
                <div class="msg-full-text">${msg.text}</div>
                <div class="msg-meta single-line">
                    <span class="author-truncate">by ${Utils.sanitize(msg.nickname || msg.userId)}(${msg.userId.substring(0, 3)}...)</span>
                    <span>${new Date(msg.timestamp).toLocaleDateString('ko-KR')}</span>
                </div>
                <!-- 3-Icon Layout -->
                <div class="msg-actions" style="margin-top: 12px; gap: 20px;">
                    ${actionButtons}
                </div>
            </div>
            <div class="comments-section">
                <h4>댓글 ${msg.commentCount || 0}개</h4>
                <div id="comments-list"></div>
            </div>
        `;

        // 댓글 로드
        this.loadComments(msg.id);
    },

    async loadComments(msgId) {
        const list = document.getElementById('comments-list');
        if (!list) return;

        try {
            // [FIX] Use MessageService directly for Android compatibility
            // const res = await fetch(`/api/messages/${msgId}/detail`);
            const data = await MessageService.fetchMessageDetail(msgId);

            // MessageService returns { ...msg, comments: [] }
            const comments = data.comments || [];
            if (comments.length === 0) {
                list.innerHTML = '<div class="empty-comments">첫 번째 댓글을 남겨보세요!</div>';
            } else {
                list.innerHTML = comments.map(c => `
                    <div class="comment-item">
                        <div class="comment-text">${Utils.sanitize(c.text)}</div>
                        <div class="msg-meta single-line" style="margin-top: 4px;">
                            <span class="author-truncate">by ${Utils.sanitize(c.userId || c.user_id)}(${(c.userId || c.user_id).substring(0, 3)}...)</span>
                            <span>${new Date(c.timestamp).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                    </div>
                `).join('');
            }

            // Update comment count in UI if possible
            const countHeader = document.querySelector('.comments-section h4');
            if(countHeader) countHeader.textContent = `댓글 ${comments.length}개`;

        } catch (e) {
            console.error(e);
            list.innerHTML = '<div class="error-state">댓글을 불러올 수 없습니다.</div>';
        }
    },

    // [NEW] Shared Card Rendering Logic (Standardized UI)
    _renderSharedCard(msg) {
        const dateStr = new Date(msg.timestamp).toLocaleDateString('ko-KR');
        // 3-Icon Layout
        const btnLike = `<button data-action="like" data-msg-id="${msg.id}" data-type="up" class="${msg.userVote === 'up' ? 'active' : ''}">👍 ${msg.likes || 0}</button>`;
        const btnDislike = `<button data-action="like" data-msg-id="${msg.id}" data-type="down" class="${msg.userVote === 'down' ? 'active' : ''}">👎 ${msg.dislikes || 0}</button>`;
        const btnComment = `<button data-action="open-thread" data-msg-id="${msg.id}">💬 ${msg.commentCount || 0}</button>`;

        return `
            <div class="main-message-card clickable-card" onclick="if(!event.target.closest('button')) SocialManager.openThreadPanel('${msg.id}')" style="margin-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 16px;">
                ${msg.tags ? `<div class="msg-tags">${Utils.sanitize(msg.tags)}</div>` : ''}
                <div class="msg-full-text">${Utils.sanitize(msg.text)}</div>
                <div class="msg-meta single-line">
                    <span class="author-truncate">by ${Utils.sanitize(msg.nickname || msg.userId)}(${msg.userId.substring(0, 3)}...)</span>
                    <span>${dateStr}</span>
                </div>
                <div class="msg-actions" style="margin-top: 12px; gap: 20px;">
                    ${btnLike}
                    ${btnDislike}
                    ${btnComment}
                </div>
            </div>
        `;
    },

    createPlaceMsgHTML(msg) {
        return this._renderSharedCard(msg);
    },

    renderPlaceTab() {
        const msg = this.messages.find(m => m.id === this.currentMessageId);
        if (!msg) return;

        const container = document.getElementById('thread-content');

        // 1. 같은 장소 (주소 일치) 대화 필터링
        const samePlaceMessages = this.messages.filter(m => {
            if (m.id === this.currentMessageId) return false;

            // 1) 주소가 모두 있고 정확히 일치하는 경우
            if (m.address && msg.address && m.address === msg.address) return true;

            // 2) 좌표 기반 거리 체크 (20m 이내)
            if (m.coords && msg.coords) {
                const dist = ol.sphere.getDistance(msg.coords, m.coords);
                if (dist <= 20) return true;
            }

            return false;
        });

        // HTML 생성
        let html = '<div class="place-messages-list" id="place-list-container">';

        // 같은 장소 대화가 있으면 표시
        if (samePlaceMessages.length > 0) {
            html += samePlaceMessages.map(m => this._renderSharedCard(m)).join('');
        } else {
             html += '<div class="empty-state">이 장소의 다른 대화가 없습니다.</div>';
        }
        html += '</div>';

        // 하단 리스트 컨테이너 (근처 대화용)
        html += `<div id="nearby-list-container" class="place-messages-list"></div>`;

        // "근처 이야기 보기" 버튼
        html += `
            <div id="load-nearby-btn" class="load-nearby-btn" onclick="SocialManager.loadNearbyMessagesForThread('${msg.id}')">
                🚩 이 장소 근처의 다른 이야기 보기
            </div>
        `;


        container.innerHTML = html;

        // 페이징 상태 초기화
        this.nearbyCursor = 0;
        this.cachedNearbySorted = null;

        // 버튼 이벤트 바인딩
        // 버튼 이벤트 바인딩
        // [FIX] Ensure DOM is ready (microtask)
        requestAnimationFrame(() => {
            const btn = document.getElementById('load-nearby-btn');
            if (btn) {
                btn.onclick = () => this.loadNearbyMessages(msg);
            }
        });
    },

    loadNearbyMessages(currentMsg) {
        // [FIX] Dynamic Element Query
        const btn = document.getElementById('load-nearby-btn');
        const container = document.getElementById('nearby-list-container');
        if (!container) return;

        // 1. 처음 로드 시에만 거리 계산 및 정렬 수행 (거리 제한 없음)
        if (!this.cachedNearbySorted) {
            this.cachedNearbySorted = this.messages.filter(m => {
                if (m.id === currentMsg.id) return false;
                // 같은 주소는 이미 위에서 보여줬으므로 제외
                if (m.address && currentMsg.address && m.address === currentMsg.address) return false;
                if (!m.coords || !currentMsg.coords) return false;
                return true;
            }).map(m => {
                return {
                    ...m,
                    distance: ol.sphere.getDistance(currentMsg.coords, m.coords)
                };
            }).sort((a, b) => a.distance - b.distance); // 거리순 정렬
        }

        // 2. 커서 기반으로 10개씩 슬라이싱
        const limit = 10;
        const nextBatch = this.cachedNearbySorted.slice(this.nearbyCursor, this.nearbyCursor + limit);

        if (nextBatch.length === 0) {
            Utils.showToast('더 이상 불러올 대화가 없습니다.');
            if (btn) btn.classList.add('hidden');
            return;
        }

        // 3. 목록 추가
        const batchHTML = nextBatch.map(m => this.createPlaceMsgHTML(m)).join('');
        container.insertAdjacentHTML('beforeend', batchHTML);

        // 4. 커서 업데이트
        this.nearbyCursor += limit;

        // 5. 버튼 처리: 아직 더 불러올 게 있으면 버튼을 목록의 최하단으로 이동
        if (this.nearbyCursor < this.cachedNearbySorted.length) {
            if (btn) {
                // 버튼을 컨테이너의 가장 마지막 형제 요소로 이동 (thread-content의 자식으로 유지하되 순서 변경)
                // insertAdjacentElement 사용이 더 안전
                const threadContent = this.elements['thread-content'];
                threadContent.appendChild(btn);
                btn.classList.remove('hidden');
            }
        } else {
            if (btn) btn.classList.add('hidden');
        }
    },

    createPlaceMsgHTML(m) {
        return `
            <div class="place-message-item" data-msg-id="${m.id}">
                <div class="place-msg-text" data-action="open-thread" data-msg-id="${m.id}">${m.text}</div>
                <div class="place-msg-footer-row">
                    <div class="place-msg-actions-left">
                         <button class="action-btn-clean" data-action="like" data-msg-id="${m.id}" data-type="up">👍 ${m.likes || 0}</button>
                         <button class="action-btn-clean" data-action="like" data-msg-id="${m.id}" data-type="down">👎 ${m.dislikes || 0}</button>
                    </div>
                    <div class="place-msg-meta" data-action="open-thread" data-msg-id="${m.id}">
                        by ${m.userId} · ${new Date(m.timestamp).toLocaleDateString()}
                    </div>
                </div>
            </div>
        `;
    },

    renderTagsTab() {
        const container = document.getElementById('thread-content');
        container.innerHTML = `
            <div class="tags-tab-content">
                <!-- View A: 검색 및 태그 클라우드 -->
                <div id="tags-main-view">
                    <div class="tags-search-bar">
                        <input type="text" id="tag-search-input" placeholder="태그 검색 (#없이 입력)..." class="tags-search-input">
                    </div>
                    <div id="tags-cloud-container" class="tags-cloud-container"></div>
                </div>

                <!-- View B: 검색 결과 리스트 (초기엔 숨김) -->
                <div id="tags-result-view" class="hidden">
                    <div id="tag-filtered-list" class="place-messages-list"></div>
                    <div class="tag-research-btn-container">
                        <button id="tag-research-btn" class="tag-research-btn">🔄 태그 재검색</button>
                    </div>
                </div>
            </div>
        `;

        // 1. 데이터 가공 (빈도수 계산)
        const tagCounts = {};
        this.messages.forEach(msg => {
            if (!msg.tags) return;
            const tags = msg.tags.split(' ').map(t => t.replace('#', '').trim()).filter(t => t);
            tags.forEach(t => {
                tagCounts[t] = (tagCounts[t] || 0) + 1;
            });
        });

        // 2. 리스트 변환 및 정렬
        const sortedTags = Object.keys(tagCounts).map(tag => ({
            tag: tag,
            count: tagCounts[tag]
        })).sort((a, b) => b.count - a.count);

        this.allTags = sortedTags;

        // 3. 초기 렌더링
        this.renderTagCloud(sortedTags);

        // 4. 이벤트 바인딩
        const input = document.getElementById('tag-search-input');
        if (input) {
            input.oninput = (e) => {
                const keyword = e.target.value.trim().toLowerCase();
                const filtered = this.allTags.filter(t => t.tag.toLowerCase().includes(keyword));
                this.renderTagCloud(filtered);
            };
        }

        // 재검색 버튼
        const researchBtn = document.getElementById('tag-research-btn');
        if (researchBtn) {
            researchBtn.onclick = () => {
                document.getElementById('tags-result-view').classList.add('hidden');
                document.getElementById('tags-main-view').classList.remove('hidden');
            };
        }
    },

    renderTagCloud(tags) {
        const container = document.getElementById('tags-cloud-container');
        if (!container) return;

        const self = this;

        if (tags.length === 0) {
            container.innerHTML = '<div class="empty-state">해당하는 태그가 없습니다.</div>';
            return;
        }

        container.innerHTML = tags.map(t => `
            <span class="tag-chip" data-tag="${t.tag}">
                #${t.tag} <span class="tag-count">${t.count}</span>
            </span>
        `).join('');

        container.onclick = function(e) {
            const chip = e.target.closest('.tag-chip');
            if (chip && chip.dataset.tag) {
                self.showTaggedMessages(chip.dataset.tag);
            }
        };
    },

    showTaggedMessages(tag) {
        const mainView = document.getElementById('tags-main-view');
        const resultView = document.getElementById('tags-result-view');
        const listContainer = document.getElementById('tag-filtered-list');

        if (!listContainer || !mainView || !resultView) return;

        const matchedMessages = this.messages.filter(m => m.tags && m.tags.includes(tag));

        // 클래스 토글 방식으로 뷰 전환
        mainView.classList.add('hidden');
        resultView.classList.remove('hidden');

        // 리스트 렌더링
        if (matchedMessages.length === 0) {
            listContainer.innerHTML = '<div class="empty-state">대화가 없습니다.</div>';
        } else {
            listContainer.innerHTML = matchedMessages.map(m => this.createPlaceMsgHTML(m)).join('');
        }
    },

    closeThreadPanel() {
        const panel = this.elements['thread-panel'];
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
        const text = this.elements['write-input']?.value || '';
        const tagInput = this.elements['write-tags'];
        const rawTags = tagInput ? tagInput.value : '';

        // [NEW] Smart Tag Parsing: Split by space, comma, period and auto-prepend #
        let parsedTags = '';
        if (rawTags.trim()) {
            const tagArray = rawTags
                .split(/[\s,.]/) // Split by space, comma, period
                .map(tag => tag.trim()) // Trim whitespace
                .filter(tag => tag.length > 0) // Remove empty strings
                .map(tag => tag.startsWith('#') ? tag : '#' + tag); // Auto-prepend #
            parsedTags = tagArray.join(' '); // Join with spaces for server compatibility
        }


        let targetCoords = (AppState.destination && AppState.destination.coords)
            ? AppState.destination.coords
            : AppState.currentPosition;


        if (!targetCoords) return Utils.showToast('전송할 위치 정보가 없습니다.');

        // 좌표 포맷 확인 (List/Array 형태여야 함)
        if (!Array.isArray(targetCoords) || targetCoords.length !== 2) {
            console.error('[DEBUG] Invalid Coords Format:', targetCoords);
            return Utils.showToast('위치 정보 형식이 올바르지 않습니다.');
        }

        const payload = {
            userId: AppState.userId,
            text: text,
            tags: parsedTags,
            coords: targetCoords,
            // 주소 정보가 있다면 함께 저장 (선택 사항)
            address: (AppState.destination && AppState.destination.name) ? AppState.destination.name : null
        };

        try {
            // [FIX] Use MessageService directly for Android compatibility
            const newMessage = await MessageService.saveMessage(payload);

            this.messages.unshift(newMessage);
            this.showNearbyMessages(); // 지도 갱신

            // 성공 처리
            this.closeWriteModal();
            Utils.showToast('📍 메시지를 남겼습니다!');
        } catch (e) {
            console.error('Save Failed:', e);
            Utils.showToast('저장 실패: ' + e.message);
        }
    },



    // 명세 4번: 플로팅 모드 주소 매칭
    getBestMessageAt(targetCoords) {
        if (!this.messages) return null;

        // 1. 거리 50m 이내 메시지 찾기
        const nearby = this.messages.filter(m => {
            const dist = ol.sphere.getDistance(m.coords, targetCoords);
            return dist < Config.NEARBY_MESSAGE_THRESHOLD;
        });

        if (nearby.length === 0) return null;

        // 2. 좋아요 순 정렬
        nearby.sort((a, b) => b.likes - a.likes);
        return nearby[0];
    },

    // 대시보드용: 상위 N개 메시지 반환
    getTopMessagesAt(targetCoords, count = 3) {
        if (!this.messages || !targetCoords) return [];

        // 1. 거리 100m 이내 메시지 찾기 (더 넓은 범위)
        const nearby = this.messages.filter(m => {
            if (!m.coords) return false;
            const dist = ol.sphere.getDistance(m.coords, targetCoords);
            return dist < Config.BEST_MESSAGE_THRESHOLD;
        });

        if (nearby.length === 0) return [];

        // 2. 좋아요 순 정렬 후 상위 N개 반환
        nearby.sort((a, b) => b.likes - a.likes);
        return nearby.slice(0, count);
    },

    /**
     * [Refined] 플로팅 라벨 자동 숨김 처리 로직
     * @param {HTMLElement} inputEl 입력창 요소
     * @param {HTMLElement} labelEl 대응하는 라벨 요소
     */
    setupLabelAutoFade(inputEl, labelEl) {
        if (!inputEl || !labelEl) return;

        // 초기 상태: 라벨 보임
        labelEl.classList.remove('hide');

        // 이미 리스너가 등록되어 있다면 리셋 로직만 수행
        if (inputEl._labelListenerAttached) return;

        let fadeTimer = null;

        const startTimer = () => {
            if (fadeTimer) clearTimeout(fadeTimer);
            // 이미 숨겨진 상태라면 무시
            if (labelEl.classList.contains('hide')) return;

            fadeTimer = setTimeout(() => {
                // 입력 포커스가 있거나 내용이 있을 때만 숨김
                if (document.activeElement === inputEl || inputEl.value.trim().length > 0) {
                    labelEl.classList.add('hide');
                }
            }, Config.FLOATING_LABEL_TIMEOUT || 5000);
        };

        const resetLabel = () => {
            if (fadeTimer) clearTimeout(fadeTimer);
            labelEl.classList.remove('hide');
            // 포커스 상태라면 다시 타이머 시작
            if (document.activeElement === inputEl || inputEl.value.trim().length > 0) {
                startTimer();
            }
        };

        inputEl.addEventListener('focus', startTimer);
        inputEl.addEventListener('input', startTimer);
        inputEl.addEventListener('blur', () => {
            // 포커스 아웃 시 내용이 없으면 라벨 다시 표시
            if (inputEl.value.trim().length === 0) {
                resetLabel();
            }
        });

        inputEl._labelListenerAttached = true;
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
            }));
        });
    }
};

window.SocialManager = SocialManager;
