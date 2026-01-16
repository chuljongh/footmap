// ========================================
// 설정 및 상수 (Config)
// ========================================
const Config = {
    // V-world API 키 (데모용)
    VWORLD_API_KEY: 'YOUR_VWORLD_API_KEY',

    // [NEW] API 기본 URL (APK/Local 환경 대응)
    // 배포 환경에 맞게 자동 감지하거나 고정값 사용
    // APK 빌드(file://)에서는 반드시 절대 경로가 필요함
    API_BASE_URL: (window.location.hostname === 'localhost' || window.location.protocol === 'file:')
        ? 'https://balgilmaeb.onrender.com'
        : '', // 웹에서는 상대경로 사용 (CORS 회피 등)

    // 지도 타일 URL (테마별)

    // 지도 타일 URL (테마별)
    MAP_TILE_LIGHT: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&hl=ko',

    // 기본 위치 (서울 시청)
    DEFAULT_CENTER: [126.9780, 37.5665],
    DEFAULT_ZOOM: 16,
    ZOOM_LEVEL_DETAIL: 18,
    ZOOM_LEVEL_OVERVIEW: 15,

    // 반응형 브레이크포인트
    BREAKPOINT_MOBILE: 768,

    // 말풍선 위치 상수
    BUBBLE_OFFSET_TOP: 20,      // 마커 위 거리 (px)
    BUBBLE_OFFSET_SIDE: 30,     // 데스크탑 좌우 거리 (px)
    MIN_BUBBLE_TOP: 80,         // 최소 상단 여백 (px)
    VIEWPORT_MARGIN: 0.05,      // 뷰포트 여백 비율 (5%)
    BOTTOM_BAR_HEIGHT: 80,      // 하단 바 높이 (px) - 말풍선 경계 계산용
    MAX_COLLECTION_SPEED: 100,  // 데이터 수집 상한선 (km/h) - 차량 이동 포함 테스트 허용
    FLOATING_LABEL_TIMEOUT: 5000, // 플로팅 라벨 숨김 타이머 (ms)
    MIN_FOOTPRINT_ZOOM: 15,     // 발자국 아이콘 렌더링 최소 줌 레벨 (출입구 확인용)
    TRAJECTORY_DEBOUNCE_MS: 300, // 궤적 로드 디바운싱 (ms)
    TRAJECTORY_INITIAL_DELAY: 2000, // 초기 궤적 로드 지연 (ms)
    TRAJECTORY_MINT: '#00D4AA',  // 궤적 기본 색상 (민트)
    NEARBY_MESSAGE_THRESHOLD: 50,  // 근처 메시지 거리 (m)
    SYNC_INTERVAL_MS: 30000,       // [NEW] 경로 실시간 동기화 주기 (30초)

    // [NEW] 경로 이탈 재탐색 설정 (보행자 최적화)
    REROUTE_THRESHOLD_METERS: 30,   // 이탈 판단 거리 (30m) - GPS 오차(약 10~20m) 고려한 적정값
    REROUTE_DEBOUNCE_MS: 5000,      // 이탈 판정 대기 (5초) - 일시적인 GPS 튐 방지
    MIN_REROUTE_INTERVAL_MS: 10000, // 재탐색 최소 간격 (10초) - 배터리 소모 및 API 과부하 방지
    BEST_MESSAGE_THRESHOLD: 100,  // 목적지 베스트 메시지 범위 (m)
    FOOTPRINT_OPACITY: 0.3,      // 발자국 개별 투명도 (중첩 효과용)

    // 말풍선 레이아웃 엔진 상수
    BUBBLE_DEFAULT_WIDTH: 300,     // 측정 실패 시 기본 너비
    BUBBLE_DEFAULT_HEIGHT: 100,    // 측정 실패 시 기본 높이
    BUBBLE_VERTICAL_SPACING: 15,   // 말풍선 간 수직 간격
    COLLISION_MARGIN: 10,          // 충돌 감지 마진
    MAX_PLACEMENT_ATTEMPTS: 30,    // 충돌 회피 최대 시도 횟수
    MAX_BUBBLE_SHIFT: 400,         // 마커로부터 최대 허용 수직 이동 거리 (px)


    COLORS: {
        PRIMARY: '#00D4AA',         // 주 색상
        ACCENT: '#F6AD55',          // 강조 (웨이포인트 마커 등)
        SOCIAL_MARKER: '#6366f1',   // 소셜 마커
        ROUTE_ACTIVE: '#FF6B00',    // 현재 경로
        ROUTE_ACTIVE_INNER: '#FFA500',
        ROUTE_FUTURE: '#999999',    // 미래 경로
        ROUTE_FUTURE_INNER: '#BBBBBB',
        ARROW_FILL: '#00D4AA',      // 방향 화살표 (Mint)
        WHITE: '#FFFFFF',           // 마커 테두리/텍스트 색상
        MARKER_HIGHLIGHT: '#FFA500', // 현위치/목적지 마커 (경로 내부선과 동일한 밝은 주황)

        // 궤적 밀집도별 색상 (1-3명, 4-10명, 11명+)
        TRAJECTORY_LOW: 'rgba(239, 68, 68, 0.3)',    // 연한 빨강
        TRAJECTORY_MID: 'rgba(246, 173, 85, 0.7)',   // 중간 주황
        TRAJECTORY_HIGH: 'rgba(0, 212, 170, 0.9)',    // 진한 민트 (PRIMARY 계열)
    },

    // 지도 레이아웃
    MAP_PADDING: [100, 50, 150, 50]
};
