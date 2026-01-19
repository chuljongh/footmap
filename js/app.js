// ========================================
// 앱 초기화 (Main Entry)
// ========================================
document.addEventListener('DOMContentLoaded', async () => {

    // ========================================
    // [NEW] 플로팅 모드 감지 (안드로이드 오버레이)
    // URL: ?mode=floating&dest_lat=37.5&dest_lng=127.0&dest_name=목적지
    // ========================================
    const urlParams = new URLSearchParams(window.location.search);
    const isFloatingMode = urlParams.get('mode') === 'floating';

    if (isFloatingMode) {
        AppState.isFloatingMode = true;
        document.body.classList.add('floating-mode');

        // 목적지 파라미터 파싱
        const destLat = parseFloat(urlParams.get('dest_lat'));
        const destLng = parseFloat(urlParams.get('dest_lng'));
        const destName = urlParams.get('dest_name') || '목적지';

        if (!isNaN(destLat) && !isNaN(destLng)) {
            AppState.floatingDest = { lat: destLat, lng: destLng, name: destName };
        }

        console.log('🪟 Floating mode activated:', AppState.floatingDest);
    }

    // 스플래시 화면 표시 후 온보딩 또는 메인 화면으로 전환
    // [FLOATING MODE] 플로팅 모드에서는 스플래시 스킵
    const splashDelay = isFloatingMode ? 0 : 1500;
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
                    // [FLOATING MODE] 플로팅 모드에서 목적지가 전달된 경우 자동 경로 안내
                    if (AppState.isFloatingMode && AppState.floatingDest) {
                        console.log('🪟 Floating mode: Auto-starting navigation to', AppState.floatingDest);
                        const { lat, lng, name } = AppState.floatingDest;

                        // 목적지 설정
                        AppState.destination = { name, coords: [lng, lat] };
                        MapManager.setDestination([lng, lat]);

                        // GPS 위치 확보 대기 후 경로 안내 시작
                        const waitForPosition = () => {
                            if (AppState.currentPosition) {
                                UIManager.handleNavigateStart();
                                // [NEW] 메시지 오버레이 자동 열기
                                setTimeout(() => SocialManager.openTalkMode(), 500);
                            } else {
                                setTimeout(waitForPosition, 500);
                            }
                        };
                        setTimeout(waitForPosition, 1000);
                        return; // 플로팅 모드에서는 세션 복원 스킵
                    }

                    // [FLOATING MODE] 목적지 없이 플로팅 모드로 진입한 경우 (세션 복원 후 메시지 열기)
                    if (AppState.isFloatingMode) {
                        // 세션 복원 후 메시지 열기 예약
                        setTimeout(() => SocialManager.openTalkMode(), 2000);
                    }

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
    }, splashDelay); // 플로팅 모드: 0ms, 일반 모드: 1500ms
});
