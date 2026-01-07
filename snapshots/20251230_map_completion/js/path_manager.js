// ========================================
// 경로 취합 및 시각화 (PathManager)
// 사용자 이동 경로 데이터 관리 및 Trajectory 렌더링
// ========================================
const PathManager = {
    // 궤적 스타일 함수
    getTrajectoryStyle(feature) {
        const userCount = feature.get('userCount') || 1;
        let color;

        if (userCount <= 3) color = 'rgba(239, 68, 68, 0.3)'; // Red (한적)
        else if (userCount <= 10) color = 'rgba(246, 173, 85, 0.5)'; // Orange (보통)
        else if (userCount <= 100) color = 'rgba(72, 187, 120, 0.8)'; // Green (활발)
        else color = 'rgba(66, 153, 225, 0.9)'; // Blue (북적)

        return new ol.style.Style({
            stroke: new ol.style.Stroke({ color: color, width: 4 })
        });
    },

    // 더미 데이터 로드 (시뮬레이션)
    loadDummyTrajectories() {
        if (!AppState.trajectoryLayer) return;

        const center = Config.DEFAULT_CENTER;
        const dummyRoutes = [
            { coords: [[center[0], center[1]], [center[0] + 0.002, center[1] + 0.001]], userCount: 15, mode: 'walking' },
            { coords: [[center[0] + 0.001, center[1] - 0.001], [center[0] + 0.003, center[1]]], userCount: 7, mode: 'walking' },
            { coords: [[center[0] - 0.001, center[1]], [center[0], center[1] + 0.002]], userCount: 2, mode: 'wheelchair' }
        ];

        dummyRoutes.forEach(route => {
            if (route.mode === AppState.userMode) {
                const feature = new ol.Feature({
                    geometry: new ol.geom.LineString(route.coords.map(c => ol.proj.fromLonLat(c))),
                    userCount: route.userCount
                });
                AppState.trajectoryLayer.getSource().addFeature(feature);
            }
        });
    }

    // 향후 기능: DataCollector와 연동하여 실제 DB 데이터 로드
    // async loadRealTrajectories() { ... }
};
