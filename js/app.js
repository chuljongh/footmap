// ========================================
// 앱 초기화 (Main Entry)
// ========================================
document.addEventListener('DOMContentLoaded', async () => {

    // 로딩 상태 메시지 업데이트 헬퍼
    const updateLoadingStatus = (msg) => {
        const el = document.getElementById('loading-status');
        if (el) el.textContent = msg;
    };

    // [NEW] 즉시 첫 번째 상태 반영
    updateLoadingStatus('매니저 초기화 중...');

    // 스플래시 화면 표시 후 온보딩 또는 메인 화면으로 전환
    setTimeout(async () => {
        try {
            updateLoadingStatus('데이터 동기화 중...');

            // 병렬 초기화로 부팅 속도 개선
            await Promise.all([
                SocialManager.init(),
                UIManager.init(),
                DataCollector.init()
            ]);

            updateLoadingStatus('센서 연결 중...');
            SensorManager.init();
            DataCollector.syncToServer(); // 초기 동기화 시도

        } catch (err) {
            console.error('❌ Init Error:', err);
            updateLoadingStatus('초기화 오류 발생');
            // 치명적이지 않은 오류는 계속 진행
        }

        // Splash Video Error Handling
        const splashChar = document.querySelector('.splash-character');
        const fallbackIcon = document.querySelector('.footprint-icon.fallback');
        if (splashChar && fallbackIcon) {
            splashChar.addEventListener('error', () => {
                splashChar.classList.add('hidden');
                fallbackIcon.classList.remove('hidden');
                fallbackIcon.classList.add('opacity-100');
            });
        }

        // 네트워크 회복 시 재동기화 (Zero-Touch 보장)
        window.addEventListener('online', () => {
            DataCollector.syncToServer();
        });

        const onboardingComplete = UIManager.loadSavedSettings();

        const screenSwitchTime = Date.now();

        if (onboardingComplete) {
            Utils.showScreen('main-screen');

            updateLoadingStatus('지도 초기화 중...');
            const mapInitTime = Date.now();
            MapManager.init(); // 지도 초기화

            UIManager.updateModeIndicator();
        } else {
            Utils.showScreen('permission-screen');
        }
    }, 1500); // 2000ms -> 1500ms로 단축 (영상 루프 최적화)
});
