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

        trajectories.forEach(route => {
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
            // 성능 최적화: 줌 레벨이 충분히 높을 때만 발자국 렌더링
            const currentZoom = AppState.map.getView().getZoom();
            if (currentZoom >= Config.MIN_FOOTPRINT_ZOOM) {
                // 건물 접근 시나 골목길(짧은 거리)에서 더 촘촘하게 표시되도록 함
                const dist = new ol.geom.LineString(coords).getLength();
                const stepDist = 15; // 15미터마다 발자국 하나 (3857 좌표계 기준 근사치)

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

        if (type === 'road') {
            return new ol.style.Style({
                stroke: new ol.style.Stroke({
                    color: color,
                    width: 3
                })
            });
        } else if (type === 'footprint') {
            // SVG 아이콘을 Data URL로 변환하여 Icon 스타일 적용
            const footprintSvg = Icons.footprint.replace('currentColor', color);
            const encodedSvg = 'data:image/svg+xml;base64,' + btoa(footprintSvg);

            return new ol.style.Style({
                image: new ol.style.Icon({
                    src: encodedSvg,
                    scale: 0.6,
                    rotation: feature.get('rotation') || 0,
                    opacity: Config.FOOTPRINT_OPACITY
                })
            });
        }
    },

    // 구버전 메서드 호환성 위해 유지 (필요 시 삭제)
    loadDummyTrajectories() {
        this.loadRealTrajectories();
    }

    // 향후 기능: DataCollector와 연동하여 실제 DB 데이터 로드
    // async loadRealTrajectories() { ... }
};
