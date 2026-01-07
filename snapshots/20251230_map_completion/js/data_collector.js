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

    async saveRoute(routeData) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORE_NAME], 'readwrite');
            const store = transaction.objectStore(this.STORE_NAME);

            const data = {
                mode: routeData.mode,
                points: routeData.points,
                timestamp: Date.now()
            };

            const request = store.add(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    // 서버 전송 시뮬레이션
    async syncToServer() {
        console.log('서버 동기화 시뮬레이션...');
    }
};
