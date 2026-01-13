// ========================================
// 경로 관리 (RouteManager)
// OSRM 기반 경로 탐색 및 스타일링 담당
// ========================================

// 화살표 SVG 데이터 (Base64 인코딩)
const ARROW_SVG_BASE64 = 'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0Ij48cGF0aCBkPSJNNCA2bDYgNi02IDYgTTE0IDZsNiA2LTYgNiIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSIzIiBmaWxsPSJub25lIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz48L3N2Zz4=';
const ARROW_SVG_DATA = 'data:image/svg+xml;base64,' + ARROW_SVG_BASE64;

// 헬퍼: 회전 각도 계산 (전역 함수로 분리하여 this 바인딩 문제 방지)
function calculateRouteRotation(geometry, i, length) {
    const nextI = Math.min(i + 1, length);
    const coord = geometry.getCoordinateAt(i / length);
    const nextCoord = geometry.getCoordinateAt(nextI / length);
    const dx = nextCoord[0] - coord[0];
    const dy = nextCoord[1] - coord[1];
    return Math.atan2(dy, dx);
}

const RouteManager = {
    // 경로 스타일 함수 (화살표 포함)
    routeStyleFunction(feature, resolution) {
        // 디버깅: 화살표 스타일 생성 여부 확인 (최초 1회만 로그가 나오진 않지만, 문제 발생 시 확인용)

        const isFuture = feature.get('isFuture');
        const styles = [];
        const geometry = feature.getGeometry();

        if (isFuture) {
            // 미래 경로: 회색 (zIndex 낮음 - 아래쪽에 렌더링)
            styles.push(new ol.style.Style({
                stroke: new ol.style.Stroke({ color: Config.COLORS.ROUTE_FUTURE, width: 8, lineCap: 'round', lineJoin: 'round' }),
                zIndex: 0
            }));
            styles.push(new ol.style.Style({
                stroke: new ol.style.Stroke({ color: Config.COLORS.ROUTE_FUTURE_INNER, width: 5, lineCap: 'round', lineJoin: 'round' }),
                zIndex: 1
            }));
        } else {
            // 현재 경로: 주황색 (zIndex 높음 - 위쪽에 렌더링)
            styles.push(new ol.style.Style({
                stroke: new ol.style.Stroke({ color: Config.COLORS.ROUTE_ACTIVE, width: 10, lineCap: 'round', lineJoin: 'round' }),
                zIndex: 10
            }));
            styles.push(new ol.style.Style({
                stroke: new ol.style.Stroke({ color: Config.COLORS.ROUTE_ACTIVE_INNER, width: 6, lineCap: 'round', lineJoin: 'round' }),
                zIndex: 11
            }));
        }

        const length = geometry.getLength();
        const interval = 50 * resolution; // 간격 조절

        // 줌 레벨 제한 완화 (너무 멀면 화살표 생략)
        if (resolution > 40) return styles;

        // 화살표 추가 (zIndex 설정으로 현재 경로 화살표가 위에 표시)
        const arrowZIndex = isFuture ? 2 : 12;

        try {
            for (let i = interval / 2; i < length; i += interval) {
                const coord = geometry.getCoordinateAt(i / length);
                const rotation = calculateRouteRotation(geometry, i, length);

                styles.push(new ol.style.Style({
                    geometry: new ol.geom.Point(coord),
                    image: new ol.style.Icon({
                        src: ARROW_SVG_DATA,
                        anchor: [0.5, 0.5],
                        rotateWithView: true,
                        rotation: -rotation,
                        scale: 0.7
                    }),
                    zIndex: arrowZIndex
                }));
            }
        } catch (e) {
            console.error('Error creating arrow style:', e);
        }

        return styles;
    },

    // 경로 표시 (OSRM API)
    async showRoute(start, end, waypoints = []) {
        try {
            const points = [start, ...waypoints, end];
            const coordString = points.map(p => `${p[0]},${p[1]}`).join(';');
            const profile = 'foot';
            const url = `https://router.project-osrm.org/route/v1/${profile}/${coordString}?overview=full&geometries=geojson&steps=true`;

            const response = await fetch(url);
            const data = await response.json();

            if (data.routes && data.routes.length > 0) {
                AppState.activeRoute = data.routes[0];
                const route = data.routes[0];

                if (AppState.routeLayer) {
                    AppState.routeLayer.getSource().clear();

                    if (route.legs && route.legs.length > 0) {
                        route.legs.forEach((leg, index) => {
                            const legCoords = [];
                            leg.steps.forEach(step => {
                                if (step.geometry && step.geometry.coordinates) {
                                    step.geometry.coordinates.forEach(c => {
                                        legCoords.push(ol.proj.fromLonLat(c));
                                    });
                                }
                            });

                            if (legCoords.length > 1) {
                                const feature = new ol.Feature({
                                    geometry: new ol.geom.LineString(legCoords)
                                });
                                feature.set('isFuture', index > 0);
                                AppState.routeLayer.getSource().addFeature(feature);
                            }
                        });
                    } else {
                        const coordinates = route.geometry.coordinates.map(coord => ol.proj.fromLonLat(coord));
                        route.cachedOlCoordinates = coordinates;

                        const feature = new ol.Feature({ geometry: new ol.geom.LineString(coordinates) });
                        feature.set('isFuture', false);
                        AppState.routeLayer.getSource().addFeature(feature);
                    }
                }

                if (AppState.map) {
                    let fullCoordinates = route.cachedOlCoordinates;
                    if (!fullCoordinates) {
                        fullCoordinates = route.geometry.coordinates.map(c => ol.proj.fromLonLat(c));
                    }

                    const fullLine = new ol.geom.LineString(fullCoordinates);
                    const extent = fullLine.getExtent();
                    AppState.map.getView().fit(extent, { padding: [100, 50, 150, 50], maxZoom: 17 });
                }

                if (typeof UIManager !== 'undefined') {
                    UIManager.updateNavigationHUD(AppState.activeRoute);
                }
            } else {
                console.warn('경로를 찾을 수 없습니다.');
                this.showStraightRoute(start, end);
            }
        } catch (error) {
            console.warn('라우팅 API 오류:', error);
            this.showStraightRoute(start, end);
        }
    },

    // 직선 경로 표시 (Fallback)
    showStraightRoute(start, end) {
        const feature = new ol.Feature({
            geometry: new ol.geom.LineString([
                ol.proj.fromLonLat(start),
                ol.proj.fromLonLat(end)
            ])
        });
        feature.set('isFuture', false);
        if (AppState.routeLayer) {
            AppState.routeLayer.getSource().clear();
            AppState.routeLayer.getSource().addFeature(feature);
        }
    }
};

// Explicit Global Export
window.RouteManager = RouteManager;
