// ========================================
// 지도 관리 (MapManager)
// ========================================
const MapManager = {
    init() {
        this.initMainMap();
        this.initOverlayMap();
        this.getCurrentPosition();
        this.setupMapInteractionListeners();
        this.setupMapClickHandler();
        this.setupZoomScaling();
    },

    // 지도 더블클릭/투터치로 목적지 설정
    setupMapClickHandler() {
        // 데스크탑: 더블클릭
        AppState.map.on('dblclick', (evt) => {
            evt.preventDefault(); // 기본 줌 동작 방지
            const coords = ol.proj.toLonLat(evt.coordinate);

            if (AppState.isNavigating) {
                UIManager.showWaypointModal(coords);
            } else {
                this.setDestinationByClick(coords);
            }
        });

        // 모바일: 투터치 (두 손가락 탭)
        const mapElement = document.getElementById('map');
        let twoFingerTapTimer = null;
        let lastTwoFingerTime = 0;

        mapElement.addEventListener('touchstart', (e) => {

            // 두 손가락 터치 감지
            if (e.touches.length === 2) {
                const now = Date.now();

                // 두 손가락으로 빠르게 두 번 탭 (더블탭)
                if (now - lastTwoFingerTime < 400) {
                    const x = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                    const y = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                    const pixel = [x, y];
                    const coordinate = AppState.map.getCoordinateFromPixel(pixel);

                    if (coordinate) {
                        const coords = ol.proj.toLonLat(coordinate);
                        if (AppState.isNavigating) {
                            UIManager.showWaypointModal(coords);
                        } else {
                            this.setDestinationByClick(coords);
                        }
                    }
                    lastTwoFingerTime = 0;
                } else {
                    lastTwoFingerTime = now;
                }
            }
        }, { passive: true });
    },

    setupZoomScaling() {
        if (!AppState.map) return;
        const view = AppState.map.getView();
        const update = () => {
            const zoom = view.getZoom();
            // [Scaling Logic] Zoom 16: 1.0, Zoom 14: 0.7, Zoom 18: 1.3
            let scale = 1.0;
            if (zoom <= 14) scale = 0.7;
            else if (zoom <= 15) scale = 0.85;
            else if (zoom <= 16) scale = 1.0;
            else if (zoom <= 17) scale = 1.15;
            else scale = 1.3;

            document.documentElement.style.setProperty('--marker-scale', scale.toString());
        };
        view.on('change:resolution', update);
        update();
    },

    // 좌표로 주소 가져오기 (Reverse Geocoding)
    async getAddressFromCoords(coords) {
        try {
            const lon = coords[0];
            const lat = coords[1];
            const response = await fetch(`/api/reverse-geo?x=${lon}&y=${lat}`);
            const data = await response.json();

            if (data.documents && data.documents.length > 0) {
                const doc = data.documents[0];
                return doc.road_address ? doc.road_address.address_name : doc.address.address_name;
            }
        } catch (e) {
            console.error('Reverse Geocoding Error:', e);
        }
        return `선택한 위치 (${lat.toFixed(5)}, ${lon.toFixed(5)})`;
    },

    // 클릭으로 목적지 설정
    async setDestinationByClick(coords) {
        const addressName = await this.getAddressFromCoords(coords);
        this.setDestination(coords, addressName);
        const searchInput = document.getElementById('search-input');
        if (searchInput) searchInput.value = addressName;
        const overlayDestEl = document.getElementById('overlay-destination');
        if (overlayDestEl) overlayDestEl.textContent = addressName;
    },

    // 지도 상호작용 리스너 (사용자 조작 감지)
    setupMapInteractionListeners() {
        const mapElement = document.getElementById('map');
        if (!mapElement) return;

        // 터치/마우스 이벤트로 사용자 조작 감지
        const interactionEvents = ['pointerdown', 'wheel', 'touchstart'];
        interactionEvents.forEach(eventType => {
            mapElement.addEventListener(eventType, () => {
                if (AppState.isNavigating) {
                    AppState.isUserInteracting = true;
                    this.startViewResetTimer();
                }
            });
        });
    },

    // 5초 후 기본 뷰로 복귀 타이머
    startViewResetTimer() {
        if (AppState.viewResetTimer) {
            clearTimeout(AppState.viewResetTimer);
        }

        AppState.viewResetTimer = setTimeout(() => {
            if (AppState.isNavigating) {
                AppState.isUserInteracting = false;
                this.fitViewToRoute();
            }
        }, 5000);
    },

    // 뷰 조정
    fitViewToRoute() {
        if (!AppState.currentPosition || !AppState.destination) return;

        // [Adaptive Zoom] 현재 위치, 모든 경유지, 최종 목적지를 포함하는 범위를 계산
        // 목적지에 접근할수록 이 범위가 좁아지며 지도가 자동으로 확대되어 상세 정보를 보여줌
        const points = [ol.proj.fromLonLat(AppState.currentPosition)];

        if (AppState.waypoints && AppState.waypoints.length > 0) {
            AppState.waypoints.forEach(wp => points.push(ol.proj.fromLonLat(wp)));
        }

        points.push(ol.proj.fromLonLat(AppState.destination.coords));

        const extent = ol.extent.boundingExtent(points);

        AppState.map.getView().fit(extent, {
            padding: [120, 50, 160, 50],
            duration: 800,
            maxZoom: 18 // 자동 확대 시 적정 상세도 유지
        });
    },

    initMainMap() {
        // Google Maps 레이어
        const isRetina = window.devicePixelRatio > 1;
        const googleUrl = isRetina
            ? 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&hl=ko&scale=2'
            : 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&hl=ko';

        const mapLayer = new ol.layer.Tile({
            source: new ol.source.XYZ({
                url: googleUrl,
                tilePixelRatio: isRetina ? 2 : 1,
                attributions: 'Map data &copy;2025 Google'
            })
        });

        // 궤적 레이어
        AppState.trajectoryLayer = new ol.layer.Vector({
            source: new ol.source.Vector(),
            style: (feature) => PathManager.getTrajectoryStyle(feature)
        });

        // 경로 레이어
        AppState.routeLayer = new ol.layer.Vector({
            source: new ol.source.Vector(),
            style: RouteManager.routeStyleFunction.bind(RouteManager),
            updateWhileAnimating: true,
            updateWhileInteracting: true
        });

        // 지도 초기화
        AppState.map = new ol.Map({
            target: 'map',
            layers: [mapLayer, AppState.trajectoryLayer, AppState.routeLayer],
            view: new ol.View({
                center: ol.proj.fromLonLat(Config.DEFAULT_CENTER),
                zoom: Config.DEFAULT_ZOOM
            }),
            interactions: ol.interaction.defaults.defaults({ doubleClickZoom: false }),
            controls: ol.control.defaults.defaults({ attribution: false, zoom: false })
        });

        // 궤적 로딩 (디바운싱 적용 + 초기 지연)
        const debouncedLoadTrajectories = Utils.debounce(() => {
            PathManager.loadRealTrajectories();
        }, Config.TRAJECTORY_DEBOUNCE_MS);

        AppState.map.on('moveend', debouncedLoadTrajectories);

        // 초기 로드 지연: 지도 타일이 먼저 로드되도록 2초 대기
        setTimeout(() => {
            PathManager.loadRealTrajectories();
        }, Config.TRAJECTORY_INITIAL_DELAY);
    },

    initOverlayMap() {
        const isRetina = window.devicePixelRatio > 1;
        const googleUrl = isRetina
            ? 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&hl=ko&scale=2'
            : 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&hl=ko';

        const mapLayer = new ol.layer.Tile({
            source: new ol.source.XYZ({
                url: googleUrl,
                tilePixelRatio: isRetina ? 2 : 1
            })
        });

        AppState.overlayMap = new ol.Map({
            target: 'overlay-map',
            layers: [mapLayer],
            view: new ol.View({
                center: ol.proj.fromLonLat(Config.DEFAULT_CENTER),
                zoom: Config.DEFAULT_ZOOM
            }),
            controls: []
        });
    },

    // 스마트 다이내믹 줌 (Smart Dynamic Zoom)
    // 회전 지점 300m 이내 접근 시 해당 영역 자동 확대 (Detail Zoom)
    handleDynamicZoom(distanceToNextTurn, turnCoords) {
        if (!AppState.isNavigating || AppState.isUserInteracting) return;

        const ZOOM_THRESHOLD = 300; // 300m 전방에서 상세 모드 전환

        if (distanceToNextTurn <= ZOOM_THRESHOLD && turnCoords && !AppState.isZoomedIn) {
            // [Detail Mode] 회전 지점 접근 시: 현위치와 회전 지점을 상세히 관찰
            AppState.isZoomedIn = true;

            const extent = ol.extent.boundingExtent([
                ol.proj.fromLonLat(AppState.currentPosition),
                ol.proj.fromLonLat(turnCoords)
            ]);

            AppState.map.getView().fit(extent, {
                padding: [150, 80, 200, 80], // 상세 뷰 여백
                duration: 800,
                maxZoom: 19 // 회전 구간이므로 더 상세하게 표시
            });
        }
        // 300m 이상일 때는 아무 동작 안함 (fitViewToRoute는 회전 완료 시에만 호출)
    },

    animateZoomToLocation(coords, zoomLevel) {
        AppState.map.getView().animate({
            center: ol.proj.fromLonLat(coords),
            zoom: zoomLevel,
            duration: 1000,
            easing: ol.easing.easeOut
        });
    },

    getCurrentPosition() {
        if (!navigator.geolocation) {
            console.warn('Geolocation을 지원하지 않는 브라우저입니다.');
            this.setCurrentPosition(Config.DEFAULT_CENTER);
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const coords = [position.coords.longitude, position.coords.latitude];
                this.setCurrentPosition(coords);
            },
            (error) => {
                console.warn('위치 정보 획득 실패:', error);
                this.setCurrentPosition(Config.DEFAULT_CENTER);
            },
            { enableHighAccuracy: true }
        );

        navigator.geolocation.watchPosition(
            (position) => {
                const coords = [position.coords.longitude, position.coords.latitude];
                const heading = position.coords.heading;
                const speed = position.coords.speed; // m/s
                this.updateCurrentPosition(coords, heading, speed);
            },
            null,
            { enableHighAccuracy: true }
        );
    },

    setCurrentPosition(coords) {
        AppState.currentPosition = coords;
        const mapCoords = ol.proj.fromLonLat(coords);

        if (!AppState.positionMarker) {
            AppState.positionMarker = new ol.Overlay({
                element: this.createMarkerElement('current'),
                positioning: 'center-center'
            });
            AppState.map.addOverlay(AppState.positionMarker);
        }

        AppState.positionMarker.setPosition(mapCoords);
        AppState.map.getView().setCenter(mapCoords);
    },

    updateCurrentPosition(coords, heading = null, speed = null) {
        AppState.currentPosition = coords;
        const mapCoords = ol.proj.fromLonLat(coords);

        // 이동수단 판별 업데이트
        if (window.SensorManager) {
            SensorManager.updateSpeed(speed);
        }

        if (AppState.positionMarker) {
            AppState.positionMarker.setPosition(mapCoords);

            const el = AppState.positionMarker.getElement();
            const dot = el.querySelector('.user-dot');
            const arrow = el.querySelector('.user-heading-arrow');

            if (heading !== null && heading !== undefined) {
                if (dot) dot.classList.add('opacity-0');
                if (arrow) {
                    arrow.classList.remove('hidden');
                    arrow.classList.add('opacity-100');
                    arrow.style.setProperty('--heading', `${heading}deg`); // CSS: transform: rotate(var(--heading))
                }
            } else {
                if (dot) dot.classList.remove('opacity-0');
                if (arrow) {
                    arrow.classList.remove('opacity-100');
                    arrow.classList.add('hidden');
                }
            }
        }

        if (AppState.isNavigating) {
            // [NEW] 목적지 100m 이내 진입 감지 (접근로 데이터 최적화)
            if (AppState.destination && !AppState.isInAccessZone) {
                const distToDestination = Utils.calculateDistance(coords, AppState.destination.coords);
                if (distToDestination <= 100) {
                    AppState.isInAccessZone = true;
                    AppState.accessHistory = []; // 접근로 기록 시작
                }
            }

            // [Optimization] 데이터 중복 방지: 3미터 이상 이동 시에만 기록
            const targetHistory = AppState.isInAccessZone ? AppState.accessHistory : AppState.routeHistory;
            const lastPoint = targetHistory[targetHistory.length - 1];
            const distanceMoved = lastPoint ? Utils.calculateDistance(lastPoint.coords, coords) : 999;

            if (distanceMoved >= 3) {
                const pointData = {
                    coords: coords,
                    timestamp: Date.now(),
                    mode: AppState.userMode,
                    heading: heading
                };

                // [NEW] 접근 구역 진입 후에는 accessHistory에만 저장
                if (AppState.isInAccessZone) {
                    AppState.accessHistory.push(pointData);
                } else {
                    AppState.routeHistory.push(pointData);
                }
            }

            if (AppState.activeRoute) {
                UIManager.updateNavigationHUD(AppState.activeRoute);
            }
        }
    },

    createMarkerElement(type) {
        const el = document.createElement('div');
        el.className = `marker marker-${type}`;

        if (type === 'current') {
            el.innerHTML = `
                <div class="user-marker-container">
                    <div class="user-dot"></div>
                    <svg class="user-heading-arrow" viewBox="0 0 24 24">
                        <path d="M12 2L4.5 20.29L5.21 21L12 18L18.79 21L19.5 20.29L12 2Z" fill="${Config.COLORS.ARROW_FILL}" stroke="white" stroke-width="2" stroke-linejoin="round"/>
                    </svg>
                </div>
            `;
        } else if (type === 'destination') {
            el.innerHTML = `
                <div class="marker-destination-wrapper">
                    <span class="marker-number"></span>
                </div>
            `;
        }
        return el;
    },

    setDestination(coords, name) {
        AppState.destination = { coords, name };

        // 검색 기록 저장 (중앙 집중식)
        if (typeof UIManager !== 'undefined' && UIManager.saveSearchHistory) {
            UIManager.saveSearchHistory(name);
        }

        const mapCoords = ol.proj.fromLonLat(coords);

        if (!AppState.destinationMarker) {
            const markerElement = this.createMarkerElement('destination');
            markerElement.classList.add('cursor-grab');

            AppState.destinationMarker = new ol.Overlay({
                element: markerElement,
                positioning: 'bottom-center',
                stopEvent: false
            });
            AppState.map.addOverlay(AppState.destinationMarker);
            this.setupDestinationDrag(markerElement);
        }

        AppState.destinationMarker.setPosition(mapCoords);

        if (AppState.currentPosition) {
            const extent = ol.extent.boundingExtent([
                ol.proj.fromLonLat(AppState.currentPosition),
                mapCoords
            ]);
            AppState.map.getView().fit(extent, { padding: [100, 50, 150, 50], maxZoom: 17 });
        }

        this.refreshMarkers();
        UIManager.enableNavigateButton();
    },

    setupDestinationDrag(element) {
        let isDragging = false;
        element.addEventListener('mousedown', (e) => {
            if (AppState.isNavigating) return;
            isDragging = true;
            element.classList.remove('cursor-grab');
            element.classList.add('cursor-grabbing');
            e.stopPropagation();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const pixel = [e.clientX, e.clientY];
            const coord = AppState.map.getCoordinateFromPixel(pixel);
            if (coord) AppState.destinationMarker.setPosition(coord);
        });

        document.addEventListener('mouseup', () => {
            if (!isDragging) return;
            isDragging = false;
            element.classList.remove('cursor-grabbing');
            element.classList.add('cursor-grab');
            this.updateDestFromMarker();
        });

        element.addEventListener('touchstart', (e) => {
            if (AppState.isNavigating) return;
            isDragging = true;
            e.stopPropagation();
        });

        document.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            const touch = e.touches[0];
            const pixel = [touch.clientX, touch.clientY];
            const coord = AppState.map.getCoordinateFromPixel(pixel);
            if (coord) AppState.destinationMarker.setPosition(coord);
        });

        document.addEventListener('touchend', () => {
            if (!isDragging) return;
            isDragging = false;
            this.updateDestFromMarker();
        });
    },

    updateDestFromMarker() {
        const newPosition = AppState.destinationMarker.getPosition();
        if (newPosition) {
            const coords = ol.proj.toLonLat(newPosition);
            const addressName = `선택한 위치 (${coords[1].toFixed(5)}, ${coords[0].toFixed(5)})`;
            AppState.destination = { coords, name: addressName };
            const searchInput = document.getElementById('search-input');
            if (searchInput) searchInput.value = addressName;
            const overlayDest = document.getElementById('overlay-destination');
            if (overlayDest) overlayDest.textContent = addressName;

            // 주소 변환 시도 (비동기)
            this.getAddressFromCoords(coords).then(addr => {
                if (addr && !addr.includes('실패')) {
                    AppState.destination.name = addr;
                    const searchInput2 = document.getElementById('search-input');
                    if (searchInput2) searchInput2.value = addr;
                    const overlayDest2 = document.getElementById('overlay-destination');
                    if (overlayDest2) overlayDest2.textContent = addr;
                }
            });
        }
    },

    // Trajectory 관련 메서드 이관 -> PathManager
    loadDummyTrajectories() {
        PathManager.loadDummyTrajectories();
    },



    // ... (Existing methods below)
    addWaypointMarker(coords) {
        // ... (Keep existing implementation for markers as it is map view specific)
        const marker = new ol.Feature({
            geometry: new ol.geom.Point(ol.proj.fromLonLat(coords))
        });

        marker.setStyle(new ol.style.Style({
            image: new ol.style.Circle({
                radius: 10,
                fill: new ol.style.Fill({ color: Config.COLORS.ACCENT }),
                stroke: new ol.style.Stroke({ color: Config.COLORS.WHITE, width: 2 })
            }),
            text: new ol.style.Text({
                text: `${AppState.waypoints.length}`,
                font: 'bold 12px sans-serif',
                fill: new ol.style.Fill({ color: Config.COLORS.WHITE }),
                offsetY: 1
            })
        }));

        const layer = new ol.layer.Vector({
            source: new ol.source.Vector({ features: [marker] }),
            zIndex: 15
        });

        AppState.map.addLayer(layer);
        AppState.waypointMarkers.push(layer);
        this.refreshMarkers();
    },

    clearWaypoints() {
        AppState.waypoints = [];
        AppState.waypointMarkers.forEach(layer => AppState.map.removeLayer(layer));
        AppState.waypointMarkers = [];
        this.refreshMarkers();
    },

    clearDestination() {
        if (AppState.destinationMarker) {
            AppState.map.removeOverlay(AppState.destinationMarker);
            AppState.destinationMarker = null;
        }
        AppState.destination = null;
        const searchInputClear = document.getElementById('search-input');
        if (searchInputClear) searchInputClear.value = '';
        const overlayDestClear = document.getElementById('overlay-destination');
        if (overlayDestClear) overlayDestClear.textContent = '목적지를 설정하세요';
        const btn = document.getElementById('navigate-btn');
        if (btn) {
            btn.classList.add('disabled');
            btn.querySelector('.btn-text').textContent = '목적지를 선택하세요';
        }
    },

    refreshMarkers() {
        AppState.waypointMarkers.forEach((layer, index) => {
            const feature = layer.getSource().getFeatures()[0];
            const style = feature.getStyle();
            if (style && style.getText) {
                style.getText().setText(`${index + 1}`);
                feature.changed();
            } else if (style instanceof ol.style.Style) {
                style.getText().setText(`${index + 1}`);
                feature.changed();
            }
        });

        if (AppState.destinationMarker) {
            const num = AppState.waypoints.length + 1;
            const el = AppState.destinationMarker.getElement();
            const numEl = el?.querySelector('.marker-number');
            if (numEl) {
                // 도착지가 2개 이상일 때만 번호 표시 (경유지 포함)
                if (AppState.waypoints.length > 0) {
                    numEl.textContent = `${num}`;
                    numEl.classList.remove('hidden');
                } else {
                    numEl.classList.add('hidden');
                }
            }
        }
    }
};

