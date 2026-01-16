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
        // 온라인이면 무조건 시도 (User requirement: 모바일 데이터여도 즉시 전송)
        return navigator.onLine;
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
            console.log(`[DataCollector] Creating new route on server... User: ${userId}`);
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
            if (!response.ok) throw new Error(`Server returned ${response.status}`);
            return await response.json();
        } catch (e) {
            console.error('[DataCollector] Server sync failed:', e);
            throw e;
        }
    },

    async updateRouteOnServer(routeId, routeData) {
        try {
            console.groupCollapsed(`[DataCollector] Updating route ${routeId}...`);
            console.log('Distance:', routeData.distance);
            console.groupEnd();

            const response = await fetch(`/api/routes/${routeId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    distance: routeData.distance,
                    duration: routeData.duration,
                    points: JSON.stringify(routeData.points),
                    endCoords: routeData.endCoords
                })
            });
            if (!response.ok) throw new Error(`Server returned ${response.status}`);
            return await response.json();
        } catch (e) {
            console.error(`[DataCollector] Update failed for route ${routeId}:`, e);
            // PUT 실패는 굳이 에러를 던져서 앱을 멈출 필요는 없음 (다음 주기나 마지막 저장 때 재시도됨)
        }
    },

    async updateToIndexedDB(key, routeData) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORE_NAME], 'readwrite');
            const store = transaction.objectStore(this.STORE_NAME);
            const request = store.get(key);

            request.onsuccess = () => {
                const data = request.result;
                if (data) {
                    // Update fields
                    data.distance = routeData.distance;
                    data.duration = routeData.duration;
                    data.points = routeData.points;
                    data.endCoords = routeData.endCoords;
                    data.timestamp = Date.now();
                    data.synced = false; // Mark as unsynced until confirmed

                    if (routeData.serverId) data.serverId = routeData.serverId;

                    const updateReq = store.put(data);
                    updateReq.onsuccess = () => resolve();
                    updateReq.onerror = () => reject(updateReq.error);
                } else {
                    reject(new Error('Route not found in DB'));
                }
            };
            request.onerror = () => reject(request.error);
        });
    },

    // [New] 세션 시작 (로컬 DB + 서버 생성)
    async startActiveRoute(routeData) {
        // 1. 로컬 저장 (우선)
        const idbId = await this.saveToIndexedDB(routeData);
        let serverId = null;

        // 2. 서버 전송 시도
        if (this.checkSyncEligibility()) {
            try {
                const serverData = await this.saveToServer(routeData);
                serverId = serverData.id;
                // 로컬에 서버 ID 매핑 및 synced 처리
                await this.updateToIndexedDB(idbId, { ...routeData, serverId });
                await this.markAsSynced(idbId);
            } catch (e) {
                console.warn('[DataCollector] Server start failed, saving locally only:', e);
            }
        }
        return { idbId, serverId };
    },

    // [New] 세션 업데이트 (로컬 DB + 서버 업데이트)
    async updateActiveRoute(idbId, serverId, routeData) {
        // 1. 로컬 업데이트
        await this.updateToIndexedDB(idbId, { ...routeData, serverId });

        // 2. 서버 업데이트 시도
        if (this.checkSyncEligibility() && serverId) {
            try {
                await this.updateRouteOnServer(serverId, routeData);
                await this.markAsSynced(idbId);
            } catch (e) {
                console.warn('[DataCollector] Server update failed:', e);
            }
        } else if (!serverId && this.checkSyncEligibility()) {
            // 서버 ID가 없으면(오프라인 시작 후 온라인 전환 시), CREATE 시도
            try {
                const serverData = await this.saveToServer(routeData);
                const newServerId = serverData.id;
                await this.updateToIndexedDB(idbId, { ...routeData, serverId: newServerId });
                await this.markAsSynced(idbId);
                return { serverId: newServerId };
            } catch (e) {
                console.warn('[DataCollector] Late create failed:', e);
            }
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
        if (!navigator.onLine) {
            console.log('[DataCollector] Offline, skipping sync.');
            return;
        }

        console.log('[DataCollector] Starting sync process...');
        const transaction = this.db.transaction([this.STORE_NAME], 'readwrite');
        const store = transaction.objectStore(this.STORE_NAME);
        const request = store.getAll();

        request.onsuccess = async () => {
            const allRoutes = request.result;
            if (!allRoutes) return;

            const unsynced = allRoutes.filter(r => !r.synced);

            console.log(`[DataCollector] Found ${unsynced.length} unsynced routes.`);

            if (unsynced.length === 0) return;

            for (const route of unsynced) {
                try {
                    await this.saveToServer(route);
                    await this.markAsSynced(route.id);
                    console.log(`[DataCollector] Synced route ${route.id} successfully.`);
                } catch (e) {
                    console.error('[DataCollector] Sync failed for route:', route.id, e);
                    // 하나라도 실패하면 네트워크 불안정 간주하여 중단 (다음 기회에)
                    break;
                }
            }
        };
    }
};

// Explicit Global Export
window.DataCollector = DataCollector;
