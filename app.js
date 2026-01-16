/**
 * 발길맵 (Footprint Map) - 메인 애플리케이션
 * 모듈화된 매니저들을 초기화하고 앱을 시작합니다.
 */

document.addEventListener('DOMContentLoaded', async () => {
    console.log('App initialization started...');

    // 스플래시 화면 표시 후 전환 (최소 2초 보장)
    const splashTimeout = new Promise(resolve => setTimeout(resolve, 2000));

    // 1. 매니저 초기화 (비동기 병렬 처리 시도)
    const initApp = async () => {
        try {
            // [Debug] Init Overlay
            if (typeof DebugOverlay !== 'undefined') DebugOverlay.init();

            // 소셜 기능 초기화 (내부적으로 loadMessages 비동기 처리됨)
            if (typeof SocialManager !== 'undefined') {
                SocialManager.init();
            }
        } catch (e) { console.error('SocialManager init failed:', e); }

        try {
            // UI 이벤트 바인딩
            if (typeof UIManager !== 'undefined') {
                UIManager.init();
            }
        } catch (e) { console.error('UIManager init failed:', e); }

        try {
            // 데이터 수집기 (IndexedDB) - 모바일에서 실패할 확률이 높으므로 타임아웃 처리
            if (typeof DataCollector !== 'undefined') {
                const dbInit = DataCollector.init();
                // 3초 내에 완료되지 않으면 포기하고 진행
                await Promise.race([
                    dbInit,
                    new Promise((_, reject) => setTimeout(() => reject(new Error('DB Init Timeout')), 3000))
                ]);
            }
        } catch (e) {
            console.warn('DataCollector init skipped or failed:', e);
        }
    };

    // 초기화와 스플래시 타이머를 동시에 실행
    await Promise.allSettled([initApp(), splashTimeout]);

    // 3. 네트워크 상태 변화 감지 (자동 동기화)
    window.addEventListener('online', () => {
        console.log('[App] Network is online. Triggering sync...');
        if (typeof DataCollector !== 'undefined') {
            DataCollector.syncToServer();
        }
    });

    // 2. 저장된 설정 로드 및 화면 전환
    try {
        const onboardingComplete = (typeof UIManager !== 'undefined')
            ? UIManager.loadSavedSettings()
            : false;

        if (onboardingComplete) {
            Utils.showScreen('main-screen');
            if (typeof MapManager !== 'undefined') {
                MapManager.init(); // 지도 로드
            }
            if (typeof UIManager !== 'undefined') {
                UIManager.updateModeIndicator();
            }
            // 앱 시작 직후 동기화 시도
            if (typeof DataCollector !== 'undefined') {
                setTimeout(() => DataCollector.syncToServer(), 3000);
            }
        } else {
            Utils.showScreen('permission-screen');
        }
    } catch (e) {
        console.error('Final transition failed, forcing main screen:', e);
        Utils.showScreen('main-screen'); // 최후의 보루
    }
});
