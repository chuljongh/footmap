// ========================================
// 앱 초기화 (Main Entry)
// ========================================
document.addEventListener('DOMContentLoaded', async () => {



    // 스플래시 화면 표시 후 온보딩 또는 메인 화면으로 전환
    setTimeout(async () => {
        try {

            // 병렬 초기화로 부팅 속도 개선
            await Promise.all([
                SocialManager.init(),
                UIManager.init(),
                DataCollector.init()
            ]);

            DataCollector.syncToServer(); // 초기 동기화 시도

        } catch (err) {
            console.error('❌ Init Error:', err);
            console.error('❌ Init Error:', err);
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

            const mapInitTime = Date.now();
            MapManager.init(); // 지도 초기화

            UIManager.updateModeIndicator();
        } else {
            Utils.showScreen('permission-screen');
        }
    }, 1500); // 2000ms -> 1500ms로 단축 (영상 루프 최적화)
});
