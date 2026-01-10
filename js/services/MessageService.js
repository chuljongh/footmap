// ========================================
// MessageService - API 통신 담당
// ========================================
const MessageService = {
    // 메시지 목록 조회
    async fetchMessages() {
        try {
            const response = await fetch('/api/messages');
            if (response.ok) {
                return await response.json();
            } else {
                throw new Error('Server error');
            }
        } catch (error) {
            console.error('MessageService.fetchMessages failed:', error);
            // 캐시 폴백
            const saved = localStorage.getItem('balgil_messages');
            if (saved) {
                console.warn('Loaded from cache due to error');
                return JSON.parse(saved);
            }
            return [];
        }
    },

    // 좋아요/싫어요 API 호출
    async vote(messageId, type, userId) {
        const response = await fetch(`/api/messages/${messageId}/vote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, userId })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || '투표 오류');
        }

        return await response.json();
    },

    // 댓글 작성 API 호출
    async postComment(messageId, userId, text) {
        const response = await fetch(`/api/messages/${messageId}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, text })
        });

        if (!response.ok) {
            throw new Error('댓글 저장 실패');
        }

        return await response.json();
    },

    // 메시지 상세 조회 (댓글 포함)
    async fetchMessageDetail(messageId) {
        const response = await fetch(`/api/messages/${messageId}/detail`);
        if (!response.ok) {
            throw new Error('상세 조회 실패');
        }
        return await response.json();
    },

    // 메시지 수정
    async updateMessage(messageId, text) {
        const response = await fetch(`/api/messages/${messageId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });

        if (!response.ok) {
            throw new Error('수정 실패');
        }
        return await response.json();
    },

    // 메시지 삭제
    async deleteMessage(messageId) {
        const response = await fetch(`/api/messages/${messageId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            throw new Error('삭제 실패');
        }
        return true;
    },

    // 새 메시지 저장
    async saveMessage(messageData) {
        const response = await fetch('/api/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(messageData)
        });

        if (!response.ok) {
            throw new Error('저장 실패');
        }
        return await response.json();
    }
};
