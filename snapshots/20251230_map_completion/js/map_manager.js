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
            if (AppState.isNavigating) return;

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
                        this.setDestinationByClick(coords);
                    }
                    lastTwoFingerTime = 0;
                } else {
                    lastTwoFingerTime = now;
                }
            }
        }, { passive: true });
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
        document.getElementById('search-input').value = addressName;
        document.getElementById('overlay-destination').textContent = addressName;
    },

    setSimpleDestination(coords) {
        const addressName = `선택한 위치 (${coords[1].toFixed(5)}, ${coords[0].toFixed(5)})`;
        this.setDestination(coords, addressName);
        document.getElementById('search-input').value = addressName;
        document.getElementById('overlay-destination').textContent = addressName;
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
        const source = AppState.routeLayer?.getSource();
        const features = source?.getFeatures();

        if (features && features.length > 0) {
            const extent = source.getExtent();
            AppState.map.getView().fit(extent, {
                padding: [120, 50, 160, 50],
                duration: 500
            });
            return;
        }

        if (!AppState.currentPosition || !AppState.destination) return;

        const extent = ol.extent.boundingExtent([
            ol.proj.fromLonLat(AppState.currentPosition),
            ol.proj.fromLonLat(AppState.destination.coords)
        ]);

        AppState.map.getView().fit(extent, {
            padding: [100, 50, 150, 50],
            duration: 500
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

        this.loadDummyTrajectories();
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
    handleDynamicZoom(distanceToNextTurn) {
        if (!AppState.isNavigating || AppState.isUserInteracting) return;

        const ZOOM_THRESHOLD = 300; // 300m 전방에서 줌인
        const ZOOM_LEVEL_DETAIL = 18; // 상세 줌 레벨

        if (distanceToNextTurn <= ZOOM_THRESHOLD) {
            // [Detail Mode] 턴 접근 시
            if (!AppState.isZoomedIn) {
                AppState.isZoomedIn = true;
                this.animateZoomToLocation(AppState.currentPosition, ZOOM_LEVEL_DETAIL);
                console.log('🔍 Smart Zoom: IN (Detail Mode)');
            } else {
                // 이미 줌인 상태면 현위치 추적만 (팬)
                const view = AppState.map.getView();
                const center = view.getCenter();
                const target = ol.proj.fromLonLat(AppState.currentPosition);
                // 너무 자주 업데이트하면 끊기므로 거리가 좀 차이나면 이동
                // (OpenLayers animate는 부드러우므로 매번 호출해도 괜찮을 수 있음)
                view.animate({ center: target, duration: 500 });
            }
        } else {
            // [Overview Mode] 직선 주행 시
            if (AppState.isZoomedIn) {
                AppState.isZoomedIn = false;
                this.fitViewToRoute();
                console.log('🗺️ Smart Zoom: OUT (Overview Mode)');
            }
        }
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
                this.updateCurrentPosition(coords, heading);
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

    updateCurrentPosition(coords, heading = null) {
        AppState.currentPosition = coords;
        const mapCoords = ol.proj.fromLonLat(coords);

        if (AppState.positionMarker) {
            AppState.positionMarker.setPosition(mapCoords);

            const el = AppState.positionMarker.getElement();
            const dot = el.querySelector('.user-dot');
            const arrow = el.querySelector('.user-heading-arrow');

            if (heading !== null && heading !== undefined) {
                if (dot) dot.style.opacity = '0';
                if (arrow) {
                    arrow.style.display = 'block';
                    arrow.style.opacity = '1';
                    arrow.style.transform = `rotate(${heading}deg)`;
                }
            } else {
                if (dot) dot.style.opacity = '1';
                if (arrow) {
                    arrow.style.opacity = '0';
                    arrow.style.display = 'none';
                }
            }
        }

        if (AppState.isNavigating) {
            AppState.routeHistory.push({
                coords: coords,
                timestamp: Date.now(),
                mode: AppState.userMode,
                heading: heading
            });

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
                <div class="user-marker-container" style="
                    position: relative; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;
                ">
                    <div class="user-dot" style="
                        position: absolute; width: 20px; height: 20px; background: #00D4AA; border: 3px solid white; border-radius: 50%; box-shadow: 0 2px 8px rgba(0,0,0,0.3); animation: pulse 2s infinite; transition: opacity 0.3s;
                    "></div>
                    <svg id="user-heading-arrow" class="user-heading-arrow" viewBox="0 0 24 24" style="
                        position: absolute; width: 36px; height: 36px; display: none; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3)); transition: transform 0.3s ease, opacity 0.3s; transform-origin: center center; 
                    ">
                        <path d="M12 2L4.5 20.29L5.21 21L12 18L18.79 21L19.5 20.29L12 2Z" fill="#00D4AA" stroke="white" stroke-width="2" stroke-linejoin="round"/>
                    </svg>
                </div>
            `;
        } else if (type === 'destination') {
            el.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; background: #E53E3E; border: 3px solid white; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); box-shadow: 0 2px 8px rgba(0,0,0,0.3);">
                    <span class="marker-number" style="transform: rotate(45deg); color: white; font-weight: bold; font-size: 14px; margin-bottom: 2px;"></span>
                </div>
            `;
        }
        return el;
    },

    setDestination(coords, name) {
        AppState.destination = { coords, name };
        const mapCoords = ol.proj.fromLonLat(coords);

        if (!AppState.destinationMarker) {
            const markerElement = this.createMarkerElement('destination');
            markerElement.style.cursor = 'grab';

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
            element.style.cursor = 'grabbing';
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
            element.style.cursor = 'grab';
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
            document.getElementById('search-input').value = addressName;
            document.getElementById('overlay-destination').textContent = addressName;

            // 주소 변환 시도 (비동기)
            this.getAddressFromCoords(coords).then(addr => {
                if (addr && !addr.includes('실패')) {
                    AppState.destination.name = addr;
                    document.getElementById('search-input').value = addr;
                    document.getElementById('overlay-destination').textContent = addr;
                }
            });
        }
    },

    // ... (Existing updateDestFromMarker remains)

    // 중복 제거됨: getAddressFromCoords (Line 428) -> 상단(Line 58) 혹은 Utils로 통합 가능
    // 현재는 상단의 getAddressFromCoords를 사용하도록 유지하거나, 필요 시 여기서 재정의.
    // 하지만 이미 상단에 정의되어 있다면 여기서는 삭제하는 것이 맞음.
    // 안전을 위해, 상단 정의를 사용한다고 가정하고 이 블록은 삭제 혹은 유지하되 호출부 확인 필요.
    // 여기서는 삭제하고, 필요한 경우 MapManager.getAddressFromCoords를 호출하는 쪽을 확인해야 함. (Line 418에서 this.getAddressFromCoords 호출 중)

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
                fill: new ol.style.Fill({ color: '#F6AD55' }),
                stroke: new ol.style.Stroke({ color: '#fff', width: 2 })
            }),
            text: new ol.style.Text({
                text: `${AppState.waypoints.length}`,
                font: 'bold 12px sans-serif',
                fill: new ol.style.Fill({ color: '#fff' }),
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
        document.getElementById('search-input').value = '';
        document.getElementById('overlay-destination').textContent = '목적지를 설정하세요';
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
            const numEl = el.querySelector('.marker-number');
            if (numEl) {
                if (AppState.waypoints.length > 0) {
                    numEl.textContent = `${num}`;
                    numEl.style.display = 'block';
                } else {
                    numEl.style.display = 'none';
                }
            }
        }
    }
};

