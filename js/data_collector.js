// ========================================
// 데이터 취합 관리 (IndexedDB)
// ========================================
const DataCollector = {
    DB_NAME: 'BalgilMapDB',
    STORE_NAME: 'routes',

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
                    points: JSON.stringify(routeData.points) // 전체 궤적
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
