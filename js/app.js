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

        // 시작 위치 파라미터 파싱 (Seoul City Hall 방지용 Handover)
        const startLat = parseFloat(urlParams.get('start_lat'));
        const startLng = parseFloat(urlParams.get('start_lng'));
        if (!isNaN(startLat) && !isNaN(startLng)) {
            AppState.currentPosition = [startLng, startLat];
            console.log('📍 Handover position applied:', AppState.currentPosition);
        }

        console.log('🪟 Floating mode activated:', AppState.floatingDest);


    }

    // [Zero-Latency] UI 제어권은 HTML/CSS(Intro Layer)가 가짐
    // JS는 무조건 메인 화면을 활성화 상태로 두고 초기화를 진행
    document.getElementById('main-screen').classList.add('active');

    // [Critical] Static Bootstrap Class 제거 (안전장치)
    setTimeout(() => {
        document.documentElement.classList.remove('new-user', 'onboarding-complete');
    }, 100);

    // [Background Init] 지도 초기화를 최우선 실행 (Data/UI 로딩과 병렬 처리)
    // DB가 느려도 지도는 먼저 뜨도록 함
    MapManager.init();

    try {
        // [Background Init] 사용자에게 화면을 먼저 보여준 후 무거운 작업 실행
        // DB 초기화 및 데이터 동기화
        await DataCollector.init();

        await Promise.all([
            SocialManager.init(),
            UIManager.init()
        ]);

        UIManager.updateModeIndicator();

        // 세션 복원 등은 데이터 초기화 후 실행
        const onboardingComplete = UIManager.loadSavedSettings();
        if (onboardingComplete) {
             restoreSession();
        }

        DataCollector.syncToServer();

    } catch (err) {
        console.error('❌ Init Error:', err);
    }

    // 세션 복원 함수 (초기화 완료 후 호출)
    async function restoreSession() {
        console.log('🔄 Starting session restore sequence...');
        setTimeout(async () => {
            try {
                // [FLOATING MODE] 플로팅 모드 처리
                if (AppState.isFloatingMode) {
                   // ... 플로팅 로직 (기존 코드 유지) ...
                   if (AppState.floatingDest) {
                        const { lat, lng, name } = AppState.floatingDest;
                        AppState.destination = { name, coords: [lng, lat] };
                        MapManager.setDestination([lng, lat]);

                        const waitForPosition = () => {
                            if (AppState.currentPosition) {
                                UIManager.handleNavigateStart();
                                setTimeout(() => SocialManager.openTalkMode(), 500);
                            } else {
                                setTimeout(waitForPosition, 500);
                            }
                        };
                        setTimeout(waitForPosition, 1000);
                        return;
                   }
                   setTimeout(() => SocialManager.openTalkMode(), 2000);
                }

                // 일반 모드 세션 복원
                let savedState = await DataCollector.loadSessionState();

                // [fallback]
                if (!savedState) {
                    const emergencyState = localStorage.getItem('emergency_nav_state');
                    if (emergencyState) {
                        try { savedState = JSON.parse(emergencyState); }
                        catch (e) { localStorage.removeItem('emergency_nav_state'); }
                    }
                }

                if (savedState) {
                    const TEN_MINUTES = 10 * 60 * 1000;
                    const sessionAge = Date.now() - (savedState.lastUpdate || savedState.startTime || 0);

                    if (sessionAge < TEN_MINUTES && savedState.destination) {
                        console.log('🔄 Restoring recent session');
                        await UIManager.restoreNavigationSession(savedState);
                    } else {
                        // Cleanup
                        localStorage.removeItem('emergency_nav_state');
                        await DataCollector.clearSessionState?.();
                    }
                }
            } catch (e) {
                console.error('Session restore failed:', e);
            }
        }, 1000);
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
                // [CRITICAL FIX] Restore Active Route & Step
                activeRoute: AppState.activeRoute,
                currentStepIndex: AppState.currentStepIndex || 0,
                lastUpdate: Date.now()
            };
            // beforeunload에서는 비동기 DB 작업이 실패할 확률이 높으므로 localStorage 병행
            localStorage.setItem('emergency_nav_state', JSON.stringify(minimalState));
        } else {
            localStorage.removeItem('emergency_nav_state');
        }
    });
});
