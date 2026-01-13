// ========================================
// 앱 상태 관리 (State)
// ========================================
const AppState = {
    currentScreen: 'splash',
    userMode: 'walking', // 'walking' | 'wheelchair'
    destination: null,
    currentPosition: null, // [lon, lat]
    isNavigating: false,
    overlayOpacity: 30, // 0-50%, 기본값 30%
    routeHistory: [], // 이동 경로 기록

    // OpenLayers 객체
    map: null,
    overlayMap: null,
    positionMarker: null,
    destinationMarker: null,
    routeLayer: null,
    trajectoryLayer: null,

    // 타이머 및 인터벌
    viewResetTimer: null,
    isUserInteracting: false,
    addressToggleInterval: null, // 대시보드 주소 토글

    destinationClearTimer: null, // 목적지 마커 삭제 타이머

    // 경유지 관련
    pendingWaypoint: null,
    waypoints: [],
    waypointMarkers: [],

    // 클립보드 중복 방지
    lastClipboardText: '',

    // 내비게이션 상태
    wakeLock: null,
    currentStepIndex: 0,

    // [NEW] 접근로 데이터 최적화 (마지막 100m만 저장)
    isInAccessZone: false,    // 목적지 100m 이내 진입 여부
    accessHistory: [],        // 접근로 데이터 (100m 이내 이동만)

    // [NEW] 경로 이탈 재탐색
    rerouteTimer: null,       // 재탐색 대기 타이머
    lastRerouteTime: 0        // 마지막 재탐색 시각 (쿨다운용)
};

// Explicit Global Export
window.AppState = AppState;
