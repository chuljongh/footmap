/**
 * 발길맵 (Footprint Map) - 메인 애플리케이션
 * 모듈화된 매니저들을 초기화하고 앱을 시작합니다.
 */

document.addEventListener('DOMContentLoaded', async () => {
    // 스플래시 화면 표시 (2초) 후 온보딩 또는 메인 화면으로 전환
    setTimeout(async () => {
        // 1. 매니저 초기화
        try {
            SocialManager.init(); // 소셜 기능 (톡) 활성화
            UIManager.init();     // UI 이벤트 바인딩

            // 데이터 수집기 (IndexedDB)
            await DataCollector.init();
        } catch (e) {
            console.error('초기화 중 오류 발생:', e);
        }

        // 2. 저장된 설정 로드 및 화면 전환
        const onboardingComplete = UIManager.loadSavedSettings();

        if (onboardingComplete) {
            Utils.showScreen('main-screen');
            MapManager.init(); // 지도 로드
            UIManager.updateModeIndicator();
        } else {
            Utils.showScreen('permission-screen');
        }
    }, 2000);
});
