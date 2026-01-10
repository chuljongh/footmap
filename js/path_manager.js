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
            // [FIX] 발자국 피처는 항상 생성, 표시 여부는 스타일 함수에서 결정
            const dist = new ol.geom.LineString(coords).getLength();

            // [NEW] 줌 레벨에 따른 동적 간격 (줌 낮을수록 간격 넓혀 개수 감소)
            const currentZoom = AppState.map?.getView()?.getZoom() || 15;
            let stepDist = 15; // 기본값 (줌 19 이상: 정밀 표시)

            if (currentZoom <= 15) {
                stepDist = 50; // 줌 15: 50m 간격 (큰 간격, 적은 개수)
            } else if (currentZoom <= 16) {
                stepDist = 35;
            } else if (currentZoom <= 17) {
                stepDist = 25;
            } else if (currentZoom <= 18) {
                stepDist = 18;
            }

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

            // [NEW] 줌 레벨에 따른 동적 스케일 (출입구 찾기 용이성)
            // 멀리서(줌 낮음) 볼수록 더 크게 표시하여 눈에 띄게 함
            let scale = 1.2; // 기본 크기 (줌 19 기준)
            if (currentZoom <= 15) {
                scale = 2.0; // 매우 큼 (동네 전체 뷰)
            } else if (currentZoom <= 16) {
                scale = 1.8;
            } else if (currentZoom <= 17) {
                scale = 1.5;
            } else if (currentZoom <= 18) {
                scale = 1.3;
            }

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
    }

    // 향후 기능: DataCollector와 연동하여 실제 DB 데이터 로드
    // async loadRealTrajectories() { ... }
};
