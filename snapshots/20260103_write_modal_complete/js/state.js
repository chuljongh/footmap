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
    slopeInterval: null, // 경사도 시뮬레이션
    destinationClearTimer: null, // 목적지 마커 삭제 타이머

    // 경유지 관련
    pendingWaypoint: null,
    waypoints: [],
    waypointMarkers: [],

    // 클립보드 중복 방지
    lastClipboardText: ''
};
