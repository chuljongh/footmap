// ========================================
// 데이터 취합 관리 (IndexedDB)
// ========================================
const DataCollector = {
    DB_NAME: 'BalgilMapDB',
    STORE_NAME: 'routes',

    // [NEW] 보행 경로 버퍼 (1초 간격 수집용)
    walkingBuffer: [],
    lastWalkingRecordTime: 0,

    // [Phase 6] 싱크 중복 방지 플래그
    isSyncing: false,

    SESSION_STORE: 'session_state',

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, 2); // DB 버전 업그레이드 (v2)

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                // 경로 기록 스토어
                if (!db.objectStoreNames.contains(this.STORE_NAME)) {
                    db.createObjectStore(this.STORE_NAME, { keyPath: 'id', autoIncrement: true });
                }
                // 세션 상태 스토어 (Seamless Navigation용)
                if (!db.objectStoreNames.contains(this.SESSION_STORE)) {
                    db.createObjectStore(this.SESSION_STORE, { keyPath: 'id' });
                }
            };
        });
    },

    // [NEW] 세션 상태 저장 (Throttle 10s 대응은 호출부에서 처리)
    async saveSessionState(state) {
        if (!this.db) return;
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.SESSION_STORE], 'readwrite');
            const store = transaction.objectStore(this.SESSION_STORE);

            // 항상 고정된 ID('active')로 저장 (단일 세션)
            const data = {
                id: 'active',
                ...state,
                lastUpdate: Date.now()
            };

            const request = store.put(data);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    // [NEW] 세션 상태 로드
    async loadSessionState() {
        if (!this.db) return null;
        return new Promise((resolve) => {
            const transaction = this.db.transaction([this.SESSION_STORE], 'readonly');
            const store = transaction.objectStore(this.SESSION_STORE);
            const request = store.get('active');
            request.onsuccess = () => {
                const result = request.result;
                if (this.isValidNavigationState(result)) {
                    resolve(result);
                } else {
                    resolve(null);
                }
            };
            request.onerror = () => resolve(null);
        });
    },

    // [NEW] 세션 상태 삭제 (정상 종료 시)
    async clearSessionState() {
        if (!this.db) return;
        return new Promise((resolve) => {
            const transaction = this.db.transaction([this.SESSION_STORE], 'readwrite');
            const store = transaction.objectStore(this.SESSION_STORE);
            const request = store.delete('active');
            request.onsuccess = () => resolve();
            request.onerror = () => resolve();
        });
    },

    // [NEW] 데이터 검증 로직
    isValidNavigationState(state) {
        if (!state || typeof state !== 'object') return false;
        if (state.id !== 'active') return false;

        // 필수 필드 체크
        if (!state.isNavigating) return false;
        if (!state.destination || !state.destination.coords || !Array.isArray(state.destination.coords)) return false;
        if (!Array.isArray(state.routeHistory)) return false;
        if (!state.lastUpdate || typeof state.lastUpdate !== 'number') return false;

        return true;
    },

    // [NEW] 보행 포인트 기록 (1초 간격)
    addWalkingPoint(point) {
        const now = Date.now();
        // 1초 간격 제어
        if (now - this.lastWalkingRecordTime < 1000) return;

        this.walkingBuffer.push({
            coords: point.coords,
            timestamp: now,
            accuracy: point.accuracy,
            speed: point.speed
        });
        this.lastWalkingRecordTime = now;

        // 버퍼 최대 크기 제한 (60초 = 60개)
        if (this.walkingBuffer.length > 60) {
            this.walkingBuffer.shift();
        }
    },

    // [NEW] 도착 역추적: 마지막 N초 데이터 추출
    extractApproachPath(seconds = 15) {
        const cutoffTime = Date.now() - (seconds * 1000);
        const recentPoints = this.walkingBuffer.filter(p => p.timestamp >= cutoffTime);

        // 버퍼 초기화
        this.walkingBuffer = [];
        this.lastWalkingRecordTime = 0;

        return recentPoints;
    },

    // [NEW] 버퍼 초기화 (네비게이션 시작 시 호출)
    resetWalkingBuffer() {
        this.walkingBuffer = [];
        this.lastWalkingRecordTime = 0;
    },

    // 서버 전송 및 로컬 저장 통합
    async saveRoute(routeData) {
        // 1. IndexedDB 저장 (항상 수행)
        const idbId = await this.saveToIndexedDB(routeData);

        // 2. 서버 전송 시도 (네트워크 상태 체크)
        if (this.checkSyncEligibility()) {
            try {
                await this.saveToServer(routeData);
                // 전송 성공 시 IDB 마크 업데이트
                await this.markAsSynced(idbId);
            } catch (e) {
                console.warn('Immediate sync failed, stored locally:', e);
            }
        }
    },

    // 현재 네트워크 환경이 전송에 적합한지 확인
    checkSyncEligibility(force = false) {
        if (force) return true;
        if (!navigator.onLine) return false;

        // 온라인 상태면 전송 (Data Saver 모드 제외)
        const connection = navigator.connection;
        if (connection?.saveData) return false;

        return true;
    },

    async markAsSynced(id) {
        return new Promise((resolve) => {
            const transaction = this.db.transaction([this.STORE_NAME], 'readwrite');
            const store = transaction.objectStore(this.STORE_NAME);
            const request = store.get(id);
            request.onsuccess = () => {
                const data = request.result;
                if (data) {
                    data.synced = true;
                    const putRequest = store.put(data);
                    // [Phase 7] put 완료 후 resolve
                    putRequest.onsuccess = () => resolve();
                    putRequest.onerror = () => resolve(); // 실패해도 진행
                } else {
                    resolve();
                }
            };
            request.onerror = () => resolve();
        });
    },

    async saveToIndexedDB(routeData) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORE_NAME], 'readwrite');
            const store = transaction.objectStore(this.STORE_NAME);

            const data = {
                mode: routeData.mode,
                points: routeData.points,
                distance: routeData.distance,
                duration: routeData.duration,
                startCoords: routeData.startCoords,
                endCoords: routeData.endCoords,
                approachPath: routeData.approachPath || [], // [Phase 7] 접근 경로 추가
                timestamp: Date.now(),
                synced: false // 초기 상태는 미동기화
            };

            const request = store.add(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async saveToServer(routeData) {
        const userId = AppState.userId;
        try {
            const response = await fetch(`/api/users/${encodeURIComponent(userId)}/routes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    distance: routeData.distance,
                    duration: routeData.duration,
                    mode: routeData.mode,
                    startCoords: routeData.startCoords,
                    endCoords: routeData.endCoords,
                    points: JSON.stringify(routeData.points), // 전체 궤적
                    approachPath: JSON.stringify(routeData.approachPath || []) // [NEW] 접근 경로
                })
            });
            return await response.json();
        } catch (e) {
            console.error('Server sync failed, will retry later:', e);
            throw e;
        }
    },

    async fetchTrajectories(bounds) {
        try {
            const response = await fetch(`/api/trajectories?bounds=${bounds.join(',')}`);
            if (!response.ok) throw new Error('API fetch failed');
            return await response.json();
        } catch (e) {
            console.error('Failed to fetch trajectories:', e);
            return [];
        }
    },

    async syncToServer() {
        // [Phase 6] 중복 싱크 방지: 이미 싱크 중이면 스킵
        if (this.isSyncing) {
            console.log('[Sync] Already syncing, skipping...');
            return;
        }
        if (!navigator.onLine) return;

        this.isSyncing = true;

        try {
            const transaction = this.db.transaction([this.STORE_NAME], 'readonly');
            const store = transaction.objectStore(this.STORE_NAME);
            const request = store.getAll();

            const allRoutes = await new Promise((resolve, reject) => {
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });

            const unsynced = allRoutes.filter(r => !r.synced);
            if (unsynced.length === 0) {
                this.isSyncing = false;
                return;
            }

            console.log(`[Sync] 미동기화 ${unsynced.length}개 업로드 시작`);

            for (const route of unsynced) {
                try {
                    await this.saveToServer(route);
                    await this.markAsSynced(route.id);
                    console.log(`[Sync] Route ${route.id} 업로드 완료`);
                } catch (e) {
                    console.error('[Sync] 개별 전송 실패:', e);
                    break; // 네트워크 에러 가능성이 높으므로 중단
                }
            }
        } catch (e) {
            console.error('[Sync] 전체 싱크 오류:', e);
        } finally {
            this.isSyncing = false;
        }
    }
};

// Explicit Global Export
window.DataCollector = DataCollector;
