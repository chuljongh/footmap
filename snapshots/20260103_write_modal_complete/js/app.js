// ========================================
// 앱 초기화 (Main Entry)
// ========================================
document.addEventListener('DOMContentLoaded', async () => {
    // 스플래시 화면 표시 후 온보딩 또는 메인 화면으로 전환
    setTimeout(async () => {
        await SocialManager.init(); // 소셜 매니저 초기화
        await UIManager.init();     // UI 매니저 초기화 (클립보드 감지 포함)

        // Splash Image Error Handling
        const splashChar = document.querySelector('.splash-character');
        const fallbackIcon = document.querySelector('.footprint-icon.fallback');
        if (splashChar && fallbackIcon) {
            splashChar.onerror = () => {
                splashChar.classList.add('hidden');
                fallbackIcon.classList.remove('hidden');
                fallbackIcon.classList.add('opacity-100');
            };
        }

        try {
            await DataCollector.init();
        } catch (e) {
            console.warn('IndexedDB 초기화 실패:', e);
        }

        const onboardingComplete = UIManager.loadSavedSettings();

        if (onboardingComplete) {
            Utils.showScreen('main-screen');
            MapManager.init(); // 지도 초기화
            UIManager.updateModeIndicator();
        } else {
            Utils.showScreen('permission-screen');
        }
    }, 2000);
});
