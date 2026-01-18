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

    // [Phase 5] XSS 방지용 HTML 이스케이프
    sanitize(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
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

    // [Phase 4] 실식별자(ID) 발급 및 관리
    getOrInitUserId() {
        let userId = this.loadState('userId');

        // 1. 이미 ID가 있으면 그대로 반환
        if (userId) return userId;

        // 2. 마이그레이션: 기존 nickname이 ID였다면 이를 userId로 계승 (기존 데이터 유지)
        const legacyNickname = this.loadState('userNickname');
        if (legacyNickname) {
            userId = legacyNickname;
        } else {
            // 3. 신규 사용자면 UUID 발급
            userId = this.generateUUID();
        }

        this.saveState('userId', userId);
        return userId;
    },

    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
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
    },



    // 두 좌표 간 거리 계산 (Haversine formula, 단위: 미터)
    calculateDistance(coord1, coord2) {
        if (!coord1 || !coord2) return 0;
        const R = 6371000; // 지구 반지름 (m)
        const dLat = (coord2[1] - coord1[1]) * Math.PI / 180;
        const dLon = (coord2[0] - coord1[0]) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(coord1[1] * Math.PI / 180) * Math.cos(coord2[1] * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    },

    // [NEW] 점과 선분 사이의 최단 거리 (미터)
    distanceToLineSegment(point, start, end) {
        const [px, py] = point;
        const [ax, ay] = start;
        const [bx, by] = end;

        const dx = bx - ax;
        const dy = by - ay;
        const lengthSq = dx * dx + dy * dy;

        if (lengthSq === 0) return this.calculateDistance(point, start);

        let t = ((px - ax) * dx + (py - ay) * dy) / lengthSq;
        t = Math.max(0, Math.min(1, t));

        const closestPoint = [ax + t * dx, ay + t * dy];
        return this.calculateDistance(point, closestPoint);
    },

    // 현재 위치에서 경로까지의 최단 거리 (Early Exit 최적화)
    calculateMinDistanceToRoute(point, routeCoordinates, threshold = 30) {
        if (!routeCoordinates || routeCoordinates.length < 2) return Infinity;

        let minDist = Infinity;

        for (let i = 0; i < routeCoordinates.length - 1; i++) {
            const dist = this.distanceToLineSegment(point, routeCoordinates[i], routeCoordinates[i + 1]);
            if (dist < minDist) minDist = dist;
            if (minDist <= threshold) return minDist;
        }

        return minDist;
    },

    // Step의 진행 방향(Bearing) 계산 (도 단위, 0=북, 90=동)
    getStepDirection(step) {
        const coords = step.geometry?.coordinates;
        if (!coords || coords.length < 2) return null;

        const [lon1, lat1] = coords[0];
        const [lon2, lat2] = coords[coords.length - 1];

        const dLon = (lon2 - lon1) * Math.PI / 180;
        const lat1Rad = lat1 * Math.PI / 180;
        const lat2Rad = lat2 * Math.PI / 180;

        const x = Math.sin(dLon) * Math.cos(lat2Rad);
        const y = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);

        let bearing = Math.atan2(x, y) * 180 / Math.PI;
        return (bearing + 360) % 360;
    },

    // 사용자 위치가 어느 Step 위에 있는지 찾기 (Step Snapping)
    // userHeading: 사용자 이동 방향 (도 단위, null이면 방향 체크 안 함)
    // currentStepIndex: 현재 안내 중인 단계 (Window Search 최적화)
    // threshold: 경로 위 판정 거리 (미터)
    findClosestStepIndex(userPos, userHeading, allSteps, currentStepIndex = 0, threshold = 30) {
        if (!allSteps || allSteps.length === 0) return -1;

        let bestIndex = -1;
        let bestDist = Infinity;

        // Window Search: 현재 위치 ±10 범위 우선
        const windowStart = Math.max(0, currentStepIndex - 3);
        const windowEnd = Math.min(allSteps.length, currentStepIndex + 10);

        for (let i = windowStart; i < windowEnd; i++) {
            const step = allSteps[i];
            const coords = step.geometry?.coordinates;
            if (!coords || coords.length < 2) continue;

            // 거리 계산
            const dist = this.calculateMinDistanceToRoute(userPos, coords, threshold);
            if (dist > threshold) continue;

            // 방향 체크 (userHeading이 있을 때만)
            if (userHeading !== null && userHeading !== undefined) {
                const stepDir = this.getStepDirection(step);
                if (stepDir !== null) {
                    let angleDiff = Math.abs(userHeading - stepDir);
                    if (angleDiff > 180) angleDiff = 360 - angleDiff;
                    // 방향이 90도 이상 다르면 스킵 (반대 방향 차선)
                    if (angleDiff > 90) continue;
                }
            }

            // 가장 가까운 Step 선택
            if (dist < bestDist) {
                bestDist = dist;
                bestIndex = i;
            }
        }

        return bestIndex;
    }
};

// Explicit Global Export
window.Utils = Utils;
