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
        // 1. IndexedDB 저장
        await this.saveToIndexedDB(routeData);

        // 2. 서버 전송
        await this.saveToServer(routeData);
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
                timestamp: Date.now()
            };

            const request = store.add(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async saveToServer(routeData) {
        const userId = AppState.userProfile?.nickname || '익명';
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
                    points: JSON.stringify(routeData.points) // 전체 궤적
                })
            });
            return await response.json();
        } catch (e) {
            console.error('Server sync failed, will retry later:', e);
            throw e;
        }
    },

    async syncToServer() {
        console.log('미전송 데이터 재동기화 로직 (TBD)...');
    }
};
