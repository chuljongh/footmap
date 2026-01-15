// ========================================
// 경로 취합 및 시각화 (PathManager)
// 사용자 이동 경로 데이터 관리 및 Trajectory 렌더링
// ========================================
const PathManager = {
    // 궤적 스타일 함수

    // 실데이터 로드 (서버 API 연동)
    async loadRealTrajectories() {
        if (!AppState.trajectoryLayer || !AppState.map) return;

        const extent = AppState.map.getView().calculateExtent(AppState.map.getSize());
        const bounds = ol.proj.transformExtent(extent, 'EPSG:3857', 'EPSG:4326');

        const trajectories = await DataCollector.fetchTrajectories(bounds);

        const source = AppState.trajectoryLayer.getSource();
        source.clear();

        // [NEW] 줌 레벨에 따른 샘플링 및 간격 조절 상수
        const currentZoom = AppState.map?.getView()?.getZoom() || 15;

        // 1. 줌 14 이하: 궤적 및 발자국 표시 안 함
        if (currentZoom <= 14) {
            source.clear();
            return;
        }

        // 2. 경로 샘플링 비율 (수식: 15→20%, 16→40% ... 19→100%)
        const routeSampleRate = Math.min(1.0, (currentZoom - 14) * 0.2);

        // 3. 발자국 간격 (수식: 줌 15→51m, 19→15m)
        const stepDist = Math.max(15, 60 - (currentZoom - 14) * 9);

        // [NEW] 샘플링 간격 (1이면 모두 표시, 5면 1/5만 표시)
        const sampleStep = Math.round(1 / routeSampleRate);

        trajectories.forEach((route, index) => {
            // [NEW] 샘플링: 비율에 따라 일부 경로만 처리
            // (랜덤 대신 인덱스 기반으로 화면 이동 시 깜빡임 방지)
            if (sampleStep > 1 && index % sampleStep !== 0) {
                return;
            }

            // 1. 기본 라인 피처 (도로 이동)
            const coords = JSON.parse(route.points).map(p => ol.proj.fromLonLat(p.coords));
            if (coords.length < 2) return;

            const lineFeature = new ol.Feature({
                geometry: new ol.geom.LineString(coords),
                userCount: route.userCount || 1,
                type: 'road'
            });
            source.addFeature(lineFeature);

            // 2. 발자국 피처 (접근로/골목 시각화)
            const dist = new ol.geom.LineString(coords).getLength();

            for (let i = 0; i <= dist; i += stepDist) {
                const fraction = i / dist;
                const coord = lineFeature.getGeometry().getCoordinateAt(fraction);

                const footFeature = new ol.Feature({
                    geometry: new ol.geom.Point(coord),
                    userCount: route.userCount || 1,
                    type: 'footprint',
                    rotation: this.getSegmentRotation(coords, fraction)
                });
                source.addFeature(footFeature);
            }
        });
    },

    // 선분의 방향(회전) 계산
    getSegmentRotation(coords, fraction) {
        const index = Math.floor(fraction * (coords.length - 1));
        const p1 = coords[index];
        const p2 = coords[index + 1] || coords[index];
        if (!p1 || !p2) return 0;
        return Math.atan2(p2[0] - p1[0], p2[1] - p1[1]);
    },

    // 궤적 스타일 함수 (라인 & 발자국 통합)
    getTrajectoryStyle(feature) {
        const type = feature.get('type');
        const color = Config.TRAJECTORY_MINT;
        const currentZoom = AppState.map?.getView()?.getZoom() || 15;
        const minZoom = Config.MIN_FOOTPRINT_ZOOM; // 설정값 사용

        if (type === 'road') {
            // [FIX] 발자국 표시 줌 이상에서는 선 숨기고 발자국만 표시
            if (currentZoom >= minZoom) {
                return null; // 스타일 없음 = 렌더링 안함
            }
            return new ol.style.Style({
                stroke: new ol.style.Stroke({
                    color: color,
                    width: 3
                })
            });
        } else if (type === 'footprint') {
            // [FIX] 발자국 표시 줌 미만에서는 발자국 숨김
            if (currentZoom < minZoom) {
                return null;
            }
            // SVG 아이콘을 Data URL로 변환하여 Icon 스타일 적용
            const footprintSvg = Icons.footprint.replace('currentColor', color);
            const encodedSvg = 'data:image/svg+xml;base64,' + btoa(footprintSvg);

            // [NEW] 줌 레벨에 따른 동적 스케일 (수식: 15→2.0, 19→1.2)
            const scale = Math.max(1.2, 2.4 - (currentZoom - 14) * 0.2);

            return new ol.style.Style({
                image: new ol.style.Icon({
                    src: encodedSvg,
                    scale: scale,
                    rotation: feature.get('rotation') || 0,
                    opacity: Config.FOOTPRINT_OPACITY
                })
            });
        }
    },

    // 구버전 메서드 호환성 위해 유지 (필요 시 삭제)
    loadDummyTrajectories() {
        this.loadRealTrajectories();
    },

    // 향후 기능: DataCollector와 연동하여 실제 DB 데이터 로드
    // async loadRealTrajectories() { ... }
};

// Explicit Global Export
window.PathManager = PathManager;
