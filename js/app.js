// ========================================
// 앱 초기화 (Main Entry)
// ========================================
document.addEventListener('DOMContentLoaded', async () => {



    // 스플래시 화면 표시 후 온보딩 또는 메인 화면으로 전환
    setTimeout(async () => {
        try {

            // [CRITICAL] DB 초기화는 가장 먼저, 확실하게 완료되어야 함
            await DataCollector.init();

            // 병렬 초기화로 부팅 속도 개선
            await Promise.all([
                SocialManager.init(),
                UIManager.init()
            ]);

            DataCollector.syncToServer(); // 초기 동기화 시도

        } catch (err) {
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

        // [NEW] 네트워크 타입 변경 감지 (모바일 데이터 → WiFi 전환 대응)
        if (navigator.connection) {
            let syncTimer = null;
            navigator.connection.addEventListener('change', () => {
                // [Debounce] 잦은 변경 이벤트 방지 (3초 대기 후 실행)
                if (syncTimer) clearTimeout(syncTimer);

                syncTimer = setTimeout(() => {
                    if (DataCollector.checkSyncEligibility()) {
                        DataCollector.syncToServer();
                    }
                }, 3000);
            });
        }

        // [NEW] 앱이 다시 활성화될 때(포그라운드 진입) 동기화 재시도
        // 이동 중 와이파이 잡고 화면 켰을 때 즉시 반응하기 위함
        document.addEventListener('visibilitychange', () => {
             if (document.visibilityState === 'visible') {
                 if (DataCollector.checkSyncEligibility()) {
                     DataCollector.syncToServer();
                 }
             }
        });

        const onboardingComplete = UIManager.loadSavedSettings();

        const screenSwitchTime = Date.now();

        if (onboardingComplete) {
            Utils.showScreen('main-screen');

            const mapInitTime = Date.now();
            MapManager.init(); // 지도 초기화

            UIManager.updateModeIndicator();

            // [NEW] 세션 복원 서비스 (Seamless Navigation)
            setTimeout(async () => {
                try {
                    let savedState = await DataCollector.loadSessionState();

                    // [fallback] IndexedDB에 없으면 localStorage(비상용) 확인
                    if (!savedState) {
                        const emergencyState = localStorage.getItem('emergency_nav_state');
                        if (emergencyState) {
                            try {
                                savedState = JSON.parse(emergencyState);
                                console.log('⚠️ Restoring from emergency local storage');
                            } catch (e) {
                                localStorage.removeItem('emergency_nav_state');
                            }
                        }
                    }

                    if (savedState) {
                        // 시간 조건 없이 무조건 자동 복원 (Seamless)
                        await UIManager.restoreNavigationSession(savedState);
                    }
                } catch (e) {
                    console.error('Session restore failed:', e);
                }
            }, 1000); // 지도 초기화 대기

        } else {
            Utils.showScreen('permission-screen');
        }

        // [NEW] 앱 종료 직전 강제 저장 서비스
        window.addEventListener('beforeunload', () => {
            if (AppState.isNavigating) {
                // 동기 방식으로 저장 시도 (브라우저 제약이 있을 수 있음)
                // IndexedDB는 비동기라 완벽하지 않지만, 최대한 마지막 상태를 localstorage에 백업
                const minimalState = {
                    isNavigating: true,
                    destination: AppState.destination,
                    waypoints: AppState.waypoints || [],
                    startTime: AppState.startTime,
                    userMode: AppState.userMode,
                    routeHistory: AppState.routeHistory,
                    accessHistory: AppState.accessHistory,
                    lastUpdate: Date.now()
                };
                // beforeunload에서는 비동기 DB 작업이 실패할 확률이 높으므로 localStorage 병행
                localStorage.setItem('emergency_nav_state', JSON.stringify(minimalState));
            } else {
                localStorage.removeItem('emergency_nav_state');
            }
        });
    }, 1500); // 2000ms -> 1500ms로 단축 (영상 루프 최적화)
});
