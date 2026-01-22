// ========================================
// MessageService - Supabase Direct 통신
// ========================================
const MessageService = {
    // Supabase 클라이언트 가져오기
    getClient() {
        if (typeof window.getSupabaseClient === 'function') {
            const client = window.getSupabaseClient();
            if (!client && typeof window.initSupabase === 'function') {
                return window.initSupabase();
            }
            return client;
        }
        return null;
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

    // [NEW] 사용자 존재 확인 및 생성
    async ensureUserExists(userId, nickname) {
        try {
            const client = this.getClient();
            if (!client) return;

            const { data: existing } = await client
                .from('user')
                .select('id')
                .eq('id', userId)
                .single();

            if (!existing) {
                await client.from('user').insert([{
                    id: userId,
                    nickname: nickname || userId,
                    points: 0,
                    total_distance: 0
                }]);
            }
        } catch (e) {
            console.warn('ensureUserExists:', e);
        }
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
            const client = this.getClient();
            if (!client) throw new Error('Supabase 미연결');

            this._lastFetchTime = Date.now();

            const { data, error } = await client
                .from('message')
                .select('id, user_id, text, tags, coord_x, coord_y, likes, dislikes, timestamp, address, comment(count), user(nickname)')
                .order('timestamp', { ascending: false })
                .limit(50);

            if (error) throw error;

            const messages = data.map(row => ({
                id: row.id,
                userId: row.user_id,
                nickname: (row.user && row.user.nickname) ? row.user.nickname : row.user_id,
                text: row.text,
                tags: row.tags,
                coords: [row.coord_x || 0, row.coord_y || 0],
                likes: row.likes || 0,
                dislikes: row.dislikes || 0,
                timestamp: new Date(row.timestamp).getTime(),
                address: row.address,
                commentCount: (row.comment && row.comment[0]) ? row.comment[0].count : 0
            }));

            localStorage.setItem('balgil_messages', JSON.stringify(messages));
            localStorage.setItem('balgil_messages_time', Date.now().toString());

            console.log('📬 Supabase에서 로드:', messages.length, '개');
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
            const client = this.getClient();
            if (!client) throw new Error('Supabase 미연결');

            await this.ensureUserExists(messageData.userId, window.AppState?.userProfile?.nickname);

            const genId = `msg_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

            const payload = {
                id: genId,
                user_id: messageData.userId,
                text: messageData.text,
                tags: messageData.tags || null,
                coord_x: messageData.coords ? messageData.coords[0] : 0,
                coord_y: messageData.coords ? messageData.coords[1] : 0,
                address: messageData.address || null,
                likes: 0,
                dislikes: 0,
                timestamp: new Date().toISOString()
            };

            const { data, error } = await client
                .from('message')
                .insert([payload])
                .select('id, user_id, text, tags, coord_x, coord_y, likes, dislikes, timestamp, address')
                .single();

            if (error) throw error;

            console.log('✅ 저장 성공:', data.id);
            localStorage.removeItem('balgil_messages_time');

            return {
                id: data.id,
                userId: data.user_id,
                text: data.text,
                tags: data.tags,
                coords: [data.coord_x, data.coord_y],
                likes: data.likes || 0,
                dislikes: data.dislikes || 0,
                timestamp: new Date(data.timestamp).getTime(),
                address: data.address
            };
        } catch (error) {
            console.error('저장 실패:', error);
            throw error;
        }
    },

    // 좋아요/싫어요
    async vote(messageId, type, userId) {
        try {
            const client = this.getClient();
            if (!client) throw new Error('Supabase 미연결');

            const column = type === 'up' ? 'likes' : 'dislikes';

            // Manual Update (Atomic RPC 없음)
            const { data: msg, error: fetchError } = await client
                .from('message')
                .select(column)
                .eq('id', messageId)
                .single();

            if (fetchError) throw fetchError;

            const newValue = (msg[column] || 0) + 1;

            const { error: updateError } = await client
                .from('message')
                .update({ [column]: newValue })
                .eq('id', messageId);

            if (updateError) throw updateError;

            return { [column]: newValue, userVote: type };
        } catch (error) {
            console.error('투표 실패:', error);
            throw error;
        }
    },

    // 댓글 작성
    async postComment(messageId, userId, text) {
        try {
            const client = this.getClient();
            if (!client) throw new Error('Supabase 미연결');

            await this.ensureUserExists(userId, window.AppState?.userProfile?.nickname);

            const genId = `cmt_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

            const { data, error } = await client
                .from('comment')
                .insert([{
                    id: genId,
                    message_id: messageId,
                    user_id: userId,
                    text: text,
                    timestamp: new Date().toISOString()
                }])
                .select('id, user_id, text, timestamp, user(nickname)')
                .single();

            if (error) throw error;

            // Map nickname for immediate display
            data.nickname = (data.user && data.user.nickname) ? data.user.nickname : data.user_id;

            return data;
        } catch (error) {
            console.error('댓글 실패:', error);
            throw error;
        }
    },

    // 메시지 상세 + 댓글 조회
    async fetchMessageDetail(messageId) {
        try {
            const client = this.getClient();
            if (!client) throw new Error('Supabase 미연결');

            const msgPromise = client
                .from('message')
                .select('*, user(nickname)')
                .eq('id', messageId)
                .single();

            const commentsPromise = client
                .from('comment')
                .select('id, user_id, text, timestamp, user(nickname)')
                .eq('message_id', messageId)
                .order('timestamp', { ascending: true });

            const [msgRes, cmtRes] = await Promise.all([msgPromise, commentsPromise]);

            if (msgRes.error) throw msgRes.error;

            // Map Comments
            const comments = (cmtRes.data || []).map(c => ({
                id: c.id,
                userId: c.user_id,
                text: c.text,
                timestamp: c.timestamp,
                nickname: (c.user && c.user.nickname) ? c.user.nickname : c.user_id
            }));

            // Map Message
            const msgData = msgRes.data;
            msgData.nickname = (msgData.user && msgData.user.nickname) ? msgData.user.nickname : msgData.user_id;

            return {
                ...msgData,
                comments: comments
            };
        } catch (error) {
            console.error('상세 조회 실패:', error);
            throw error;
        }
    },

    // 투표 취소
    async cancelVote(messageId, type) {
        try {
            const client = this.getClient();
            if (!client) throw new Error('Supabase 미연결');

            const column = type === 'up' ? 'likes' : 'dislikes';

            const { data: msg, error: fetchError } = await client
                .from('message')
                .select(column)
                .eq('id', messageId)
                .single();

            if (fetchError) throw fetchError;

            const currentValue = msg[column] || 0;
            const newValue = Math.max(0, currentValue - 1);

            const { error: updateError } = await client
                .from('message')
                .update({ [column]: newValue })
                .eq('id', messageId);

            if (updateError) throw updateError;
            return { [column]: newValue };
        } catch (error) {
            console.error('투표 취소 실패:', error);
            throw error;
        }
    }
};

window.MessageService = MessageService;
