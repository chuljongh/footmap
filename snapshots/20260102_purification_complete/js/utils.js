// ========================================
// 유틸리티 함수 (Utils)
// ========================================
const Utils = {
    // 화면 전환
    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        const targetScreen = document.getElementById(screenId);
        if (targetScreen) {
            targetScreen.classList.add('active');
            AppState.currentScreen = screenId;
        }
    },

    // LocalStorage 저장/로드
    saveState(key, value) {
        try {
            localStorage.setItem(`balgil_${key}`, JSON.stringify(value));
        } catch (e) {
            console.warn('LocalStorage 저장 실패:', e);
        }
    },

    loadState(key, defaultValue) {
        try {
            const saved = localStorage.getItem(`balgil_${key}`);
            return saved ? JSON.parse(saved) : defaultValue;
        } catch (e) {
            return defaultValue;
        }
    },

    // 랜덤 별명 생성기
    generateRandomNickname() {
        const adjectives = ['홀로 날으는', '화성을 폭격하는', '하품하는', '춤추는', '노래하는', '달리는', '꿈꾸는', '잠자는', '배고픈', '행복한'];
        const nouns = ['돈까스', '망고', '김치', '고양이', '강아지', '로켓', '자전거', '피자', '호랑이', '토끼'];

        const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
        const noun = nouns[Math.floor(Math.random() * nouns.length)];

        return `${adj} ${noun}`;
    },

    // 랜덤 프로필 이미지 (SVG)
    getRandomProfileImage() {
        const colors = ['FF6B6B', '4ECDC4', '45B7D1', '96CEB4', 'FFEEAD', 'D4A5A5', '9B59B6', '3498DB'];
        const color = colors[Math.floor(Math.random() * colors.length)];
        return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23${color}'/%3E%3Ctext x='50' y='50' dy='.3em' text-anchor='middle' font-size='40'%3E👤%3C/text%3E%3C/svg%3E`;
    },

    // CSS 변수 업데이트
    updateCSSVar(name, value) {
        document.documentElement.style.setProperty(name, value);
    },

    // 디바운스 함수 (검색어 자동완성용)
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    // 토스트 메시지 표시
    showToast(message, duration = 2000) {
        let toast = document.getElementById('toast-message');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'toast-message';
            toast.className = 'toast-message';
            document.body.appendChild(toast);
        }

        toast.textContent = message;
        toast.classList.add('show');

        setTimeout(() => {
            toast.classList.remove('show');
        }, duration);
    }
};
