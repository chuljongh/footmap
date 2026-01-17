// ========================================
// 데이터 취합 관리 (IndexedDB)
// ========================================
const DataCollector = {
    DB_NAME: 'BalgilMapDB',
    STORE_NAME: 'routes',
    walkingBuffer: [], // [NEW] 보행 구간 고해상도 GPS 버퍼 (1초 간격)
    lastWalkingRecordTime: 0, // [NEW] 마지막 보행 기록 시간 (1초 간격 제어용)

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, 1);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.STORE_NAME)) {
                    db.createObjectStore(this.STORE_NAME, { keyPath: 'id', autoIncrement: true });
                }
            };
        });
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

    // [NEW] 보행 포인트 기록 (1초 간격, Access Zone 내에서만 호출됨)
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
                    store.put(data);
                }
                resolve();
            };
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
                timestamp: Date.now(),
                synced: false // 초기 상태는 미동기화
            };

            const request = store.add(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async saveToServer(routeData) {
        const userId = AppState.userProfile?.nickname || '익명';
        try {
            const response = await fetch(`${Config.API_BASE_URL}/api/users/${encodeURIComponent(userId)}/routes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    distance: routeData.distance,
                    duration: routeData.duration,
                    mode: routeData.mode,
                    startCoords: routeData.startCoords,
                    endCoords: routeData.endCoords,
                    points: JSON.stringify(routeData.points), // 전체 궤적
                    approachPath: JSON.stringify(routeData.approachPath || []) // [NEW] 도보 접근 경로
                })
            });
            if (!response.ok) throw new Error(`Server returned ${response.status}`);
            const result = await response.json();
            if (typeof DebugOverlay !== 'undefined') DebugOverlay.update({ sync: 'Success (POST)' });
            return result;
        } catch (e) {
            console.error('[DataCollector] Server sync failed:', e);
            if (typeof DebugOverlay !== 'undefined') DebugOverlay.update({ sync: `Fail (POST): ${e.message}` });
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
        if (!navigator.onLine) return;

        const transaction = this.db.transaction([this.STORE_NAME], 'readwrite');
        const store = transaction.objectStore(this.STORE_NAME);
        const request = store.getAll();

        request.onsuccess = async () => {
            const allRoutes = request.result;
            const unsynced = allRoutes.filter(r => !r.synced);

            if (unsynced.length === 0) return;


            for (const route of unsynced) {
                try {
                    await this.saveToServer(route);
                    await this.markAsSynced(route.id);
                } catch (e) {
                    console.error('[Sync] 개별 전송 실패:', e);
                    break; // 네트워크 에러 가능성이 높으므로 중단
                }
            }
        };
    }
};

// Explicit Global Export
window.DataCollector = DataCollector;
