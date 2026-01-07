// ========================================
// 설정 및 상수 (Config)
// ========================================
const Config = {
    // V-world API 키 (데모용)
    VWORLD_API_KEY: 'YOUR_VWORLD_API_KEY',

    // 기본 위치 (서울 시청)
    DEFAULT_CENTER: [126.9780, 37.5665],
    DEFAULT_ZOOM: 16,

    // 반응형 브레이크포인트
    BREAKPOINT_MOBILE: 768,

    // 말풍선 위치 상수
    BUBBLE_OFFSET_TOP: 20,      // 마커 위 거리 (px)
    BUBBLE_OFFSET_SIDE: 30,     // 데스크탑 좌우 거리 (px)
    MIN_BUBBLE_TOP: 80,         // 최소 상단 여백 (px)
    VIEWPORT_MARGIN: 0.05,      // 뷰포트 여백 비율 (5%)
    BOTTOM_BAR_HEIGHT: 80,      // 하단 바 높이 (px) - 말풍선 경계 계산용

    // 메시지 관련
    NEARBY_MESSAGE_DISTANCE: 50, // 근처 메시지 판정 거리 (m)

    COLORS: {
        PRIMARY: '#00D4AA',         // 주 색상
        ACCENT: '#F6AD55',          // 강조 (웨이포인트 마커 등)
        SOCIAL_MARKER: '#6366f1',   // 소셜 마커
        ROUTE_ACTIVE: '#FF6B00',    // 현재 경로
        ROUTE_ACTIVE_INNER: '#FFA500',
        ROUTE_FUTURE: '#999999',    // 미래 경로
        ROUTE_FUTURE_INNER: '#BBBBBB',
        ARROW_FILL: '#00D4AA',      // 방향 화살표
        WHITE: '#FFFFFF',           // 마커 테두리/텍스트 색상
        MARKER_HIGHLIGHT: '#FFA500', // 현위치/목적지 마커 (경로 내부선과 동일한 밝은 주황)
    },

    // 지도 레이아웃
    MAP_PADDING: [100, 50, 150, 50]
};
