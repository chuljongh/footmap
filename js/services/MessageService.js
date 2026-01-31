// ========================================
// MessageService - Flask API (Neon DB) 통신
// ========================================
const MessageService = {
    // API 베이스 URL (필요시 Config.API_BASE_URL 사용)
    getApiUrl(path) {
        const base = (window.Config && window.Config.API_BASE_URL) ? window.Config.API_BASE_URL : '';
        return `${base}${path}`;
    },

    // 캐시 유효성 확인 (5분)
    isCacheValid() {
        const savedTime = localStorage.getItem('balgil_messages_time');
        if (!savedTime) return false;
        return (Date.now() - parseInt(savedTime)) < 5 * 60 * 1000;
    },

    _lastFetchTime: 0,
    canFetch() {
        return Date.now() - this._lastFetchTime > 3000; // 3초 쿨다운
    },

    // 메시지 목록 조회
    async fetchMessages(forceRefresh = false) {
        if (!forceRefresh && this.isCacheValid()) {
            const saved = localStorage.getItem('balgil_messages');
            if (saved) return JSON.parse(saved);
        }

        if (!forceRefresh && !this.canFetch()) {
            const saved = localStorage.getItem('balgil_messages');
            return saved ? JSON.parse(saved) : [];
        }

        try {
            this._lastFetchTime = Date.now();
            const response = await fetch(this.getApiUrl('/api/messages'));
            if (!response.ok) throw new Error('API fetch failed');

            const data = await response.json();

            // UI 호환성을 위해 데이터 매핑
            const messages = data.map(row => ({
                id: row.id,
                userId: row.userId,
                nickname: row.nickname || row.userId,
                text: row.text,
                tags: row.tags,
                coords: row.coords, // [lon, lat]
                likes: row.likes || 0,
                dislikes: row.dislikes || 0,
                timestamp: row.timestamp, // ms
                address: row.address,
                commentCount: row.commentCount || 0
            }));

            localStorage.setItem('balgil_messages', JSON.stringify(messages));
            localStorage.setItem('balgil_messages_time', Date.now().toString());

            console.log('📬 Neon DB에서 로드:', messages.length, '개');
            return messages;
        } catch (error) {
            console.error('fetchMessages 실패:', error);
            const saved = localStorage.getItem('balgil_messages');
            return saved ? JSON.parse(saved) : [];
        }
    },

    // 새 메시지 저장
    async saveMessage(messageData) {
        try {
            const response = await fetch(this.getApiUrl('/api/messages'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: messageData.userId,
                    text: messageData.text,
                    tags: messageData.tags || '',
                    coords: messageData.coords,
                    address: messageData.address || ''
                })
            });

            if (!response.ok) throw new Error('Save failed');
            const data = await response.json();

            console.log('✅ 저장 성공:', data.id);
            localStorage.removeItem('balgil_messages_time');

            return {
                id: data.id,
                userId: data.userId,
                text: data.text,
                tags: data.tags,
                coords: data.coords,
                likes: data.likes || 0,
                dislikes: data.dislikes || 0,
                timestamp: data.timestamp,
                address: data.address
            };
        } catch (error) {
            console.error('저장 실패:', error);
            throw error;
        }
    },

    // 좋아요/싫어요 (Server-side Toggle Logic)
    async vote(messageId, type, userId) {
        try {
            const response = await fetch(this.getApiUrl(`/api/messages/${messageId}/vote`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: userId,
                    type: type // 'up' or 'down'
                })
            });

            if (!response.ok) throw new Error('Vote failed');
            const data = await response.json();

            return {
                likes: data.likes,
                dislikes: data.dislikes,
                userVote: data.userVote // 'up', 'down', or null
            };
        } catch (error) {
            console.error('투표 실패:', error);
            throw error;
        }
    },

    // 댓글 작성
    async postComment(messageId, userId, text) {
        try {
            const response = await fetch(this.getApiUrl(`/api/messages/${messageId}/comments`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: userId,
                    text: text
                })
            });

            if (!response.ok) throw new Error('Comment failed');
            return await response.json();
        } catch (error) {
            console.error('댓글 실패:', error);
            throw error;
        }
    },

    // 메시지 상세 + 댓글 조회
    async fetchMessageDetail(messageId) {
        try {
            const userId = window.AppState?.userId || 'anonymous';
            const response = await fetch(this.getApiUrl(`/api/messages/${messageId}/detail?userId=${userId}`));
            if (!response.ok) throw new Error('Fetch detail failed');

            return await response.json();
        } catch (error) {
            console.error('상세 조회 실패:', error);
            throw error;
        }
    },

    // 투표 취소 (Backwards compatibility - Flask now handles toggle in /vote)
    async cancelVote(messageId, type) {
        const userId = window.AppState?.userId;
        if (!userId) return;
        return this.vote(messageId, type, userId);
    }
};

window.MessageService = MessageService;
