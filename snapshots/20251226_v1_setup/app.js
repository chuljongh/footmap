/**
 * 발길맵 (Footprint Map) - 메인 애플리케이션
 * 배달원/휠체어 이용자를 위한 라스트 마일 내비게이션
 */

// ========================================
// 앱 상태 관리
// ========================================
const AppState = {
    currentScreen: 'splash',
    userMode: 'walking', // 'walking' | 'wheelchair'
    destination: null,
    currentPosition: null,
    isNavigating: false,
    overlayOpacity: 30, // 0-50%, 기본값 30%
    routeHistory: [], // 이동 경로 기록 (모드 정보 포함)
    map: null,
    overlayMap: null,
    positionMarker: null,
    destinationMarker: null,
    routeLayer: null,
    trajectoryLayer: null,
    viewResetTimer: null, // 뷰 리셋 타이머 (5초)
    isUserInteracting: false, // 사용자 지도 조작 중
    pendingWaypoint: null, // 경유지 설정 대기 좌표
    waypoints: [], // 경유지 목록
    waypointMarkers: [] // 경유지 마커 레이어 목록
};

// ========================================
// 유틸리티 함수
// ========================================
const Utils = {
    // 화면 전환
    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        const targetScreen = document.getElementById(screenId);
        if (targetScreen) {
            targetScreen.classList.add('active');
            AppState.currentScreen = screenId;
        }
    },

    // LocalStorage 저장/로드
    saveState(key, value) {
        try {
            localStorage.setItem(`balgil_${key}`, JSON.stringify(value));
        } catch (e) {
            console.warn('LocalStorage 저장 실패:', e);
        }
    },

    loadState(key, defaultValue) {
        try {
            const saved = localStorage.getItem(`balgil_${key}`);
            return saved ? JSON.parse(saved) : defaultValue;
        } catch (e) {
            return defaultValue;
        }
    },

    // 랜덤 별명 생성기
    generateRandomNickname() {
        const adjectives = ['홀로 날으는', '화성을 폭격하는', '하품하는', '춤추는', '노래하는', '달리는', '꿈꾸는', '잠자는', '배고픈', '행복한'];
        const nouns = ['돈까스', '망고', '김치', '고양이', '강아지', '로켓', '자전거', '피자', '호랑이', '토끼'];

        const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
        const noun = nouns[Math.floor(Math.random() * nouns.length)];

        return `${adj} ${noun}`;
    },

    // 랜덤 프로필 이미지 (Placehold.co 활용 or SVG)
    getRandomProfileImage() {
        // 간단한 SVG 아바타 생성 (배경색 랜덤)
        const colors = ['FF6B6B', '4ECDC4', '45B7D1', '96CEB4', 'FFEEAD', 'D4A5A5', '9B59B6', '3498DB'];
        const color = colors[Math.floor(Math.random() * colors.length)];
        return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23${color}'/%3E%3Ctext x='50' y='50' dy='.3em' text-anchor='middle' font-size='40'%3E👤%3C/text%3E%3C/svg%3E`;
    },

    // CSS 변수 업데이트
    updateCSSVar(name, value) {
        document.documentElement.style.setProperty(name, value);
    },

    // 디바운스 함수 (검색어 자동완성용)
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
};

// ========================================
// 지도 초기화 (V-world + OpenLayers)
// ========================================
const MapManager = {
    // V-world API 키 (데모용 - 실제 사용 시 발급 필요)
    VWORLD_API_KEY: 'YOUR_VWORLD_API_KEY',

    // 서울 시청 좌표 (기본값)
    DEFAULT_CENTER: [126.9780, 37.5665],
    DEFAULT_ZOOM: 16,

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
                    // 두 손가락의 중간 지점 계산
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

    // 클릭으로 목적지 설정
    // 클릭으로 목적지 설정
    async setDestinationByClick(coords) {
        try {
            const lon = coords[0];
            const lat = coords[1];

            // 로컬 파이썬 서버의 프록시 API 호출 (REST API 사용)
            const response = await fetch(`/api/reverse-geo?x=${lon}&y=${lat}`);
            const data = await response.json();

            let addressName = '';

            if (data.documents && data.documents.length > 0) {
                const doc = data.documents[0];
                addressName = doc.road_address ?
                    doc.road_address.address_name :
                    doc.address.address_name;
            } else {
                addressName = `선택한 위치 (${lat.toFixed(5)}, ${lon.toFixed(5)})`;
            }

            this.setDestination(coords, addressName);
            document.getElementById('search-input').value = addressName;
            document.getElementById('overlay-destination').textContent = addressName;

        } catch (e) {
            console.error('Reverse Geocoding Error:', e);
            this.setSimpleDestination(coords);
        }
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
        // 기존 타이머 취소
        if (AppState.viewResetTimer) {
            clearTimeout(AppState.viewResetTimer);
        }

        // 5초 후 기본 뷰로 복귀
        AppState.viewResetTimer = setTimeout(() => {
            if (AppState.isNavigating) {
                AppState.isUserInteracting = false;
                this.fitViewToRoute();
            }
        }, 5000);
    },

    // 출발지와 목적지가 한 화면에 들어오도록 뷰 조정
    fitViewToRoute() {
        // 경로 피처가 있으면 경로 전체를 기준으로 맞춤
        const source = AppState.routeLayer?.getSource();
        const features = source?.getFeatures();

        if (features && features.length > 0) {
            const extent = source.getExtent();
            AppState.map.getView().fit(extent, {
                padding: [120, 50, 160, 50], // 상하 패딩 넉넉히 (검색창/버튼 고려)
                duration: 500
            });
            return;
        }

        // 경로가 없으면 기존 방식 (출발지-목적지)
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
        // Google Maps 레이어 (디자인 + 상세 정보 모두 충족)
        // lyrs=m: 표준 지도, hl=ko: 한글 표기
        const isRetina = window.devicePixelRatio > 1;
        const googleUrl = isRetina
            ? 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&hl=ko&scale=2'
            : 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&hl=ko';

        const mapLayer = new ol.layer.Tile({
            source: new ol.source.XYZ({
                url: googleUrl,
                tilePixelRatio: isRetina ? 2 : 1, // Retina 대응
                attributions: 'Map data &copy;2025 Google'
            })
        });

        // 궤적 레이어
        AppState.trajectoryLayer = new ol.layer.Vector({
            source: new ol.source.Vector(),
            style: this.getTrajectoryStyle.bind(this)
        });

        // 경로 레이어
        AppState.routeLayer = new ol.layer.Vector({
            source: new ol.source.Vector(),
            style: this.routeStyleFunction.bind(this),
            updateWhileAnimating: true,
            updateWhileInteracting: true
        });

        // 지도 초기화
        AppState.map = new ol.Map({
            target: 'map',
            layers: [mapLayer, AppState.trajectoryLayer, AppState.routeLayer],
            view: new ol.View({
                center: ol.proj.fromLonLat(this.DEFAULT_CENTER),
                zoom: this.DEFAULT_ZOOM
            }),
            // 더블클릭 줌 비활성화 (핀 생성과 충돌 방지)
            interactions: ol.interaction.defaults.defaults({ doubleClickZoom: false }),
            controls: ol.control.defaults.defaults({ attribution: false, zoom: false })
        });

        // 더미 궤적 데이터 표시
        this.loadDummyTrajectories();
    },

    initOverlayMap() {
        // Overlay Map: Google Maps 적용
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
                center: ol.proj.fromLonLat(this.DEFAULT_CENTER),
                zoom: this.DEFAULT_ZOOM
            }),
            controls: []
        });
    },

    getCurrentPosition() {
        if (!navigator.geolocation) {
            console.warn('Geolocation을 지원하지 않는 브라우저입니다.');
            this.setCurrentPosition(this.DEFAULT_CENTER);
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const coords = [position.coords.longitude, position.coords.latitude];
                this.setCurrentPosition(coords);
            },
            (error) => {
                console.warn('위치 정보 획득 실패:', error);
                this.setCurrentPosition(this.DEFAULT_CENTER);
            },
            { enableHighAccuracy: true }
        );

        // 위치 추적 시작
        navigator.geolocation.watchPosition(
            (position) => {
                const coords = [position.coords.longitude, position.coords.latitude];
                const heading = position.coords.heading; // 모바일/지원기기: 0~360
                this.updateCurrentPosition(coords, heading);
            },
            null,
            { enableHighAccuracy: true }
        );
    },

    setCurrentPosition(coords) {
        AppState.currentPosition = coords;
        const mapCoords = ol.proj.fromLonLat(coords);

        // 현위치 마커 생성
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

            // 마커 요소 가져오기
            const el = AppState.positionMarker.getElement();
            const dot = el.querySelector('.user-dot');
            const arrow = el.querySelector('.user-heading-arrow');

            // 헤딩(방향) 업데이트 및 모드 전환
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

        // 경로 기록 (모드 정보와 함께)
        if (AppState.isNavigating) {
            AppState.routeHistory.push({
                coords: coords,
                timestamp: Date.now(),
                mode: AppState.userMode,
                heading: heading
            });

            // 맵 중심 이동 로직 제거 (경로 전체 조망 유지)
            // if (!AppState.isUserInteracting) {
            //     AppState.map.getView().setCenter(mapCoords);
            // }

            // HUD 업데이트
            if (AppState.activeRoute) {
                UIManager.updateNavigationHUD(AppState.activeRoute);
            }
        }
    },

    createMarkerElement(type) {
        const el = document.createElement('div');
        el.className = `marker marker-${type}`;

        if (type === 'current') {
            // 컨테이너: 원형(정지) & 화살표(이동) 두 가지 상태 포함
            el.innerHTML = `
                <div class="user-marker-container" style="
                    position: relative; 
                    width: 40px; 
                    height: 40px; 
                    display: flex; 
                    align-items: center; 
                    justify-content: center;
                ">
                    <!-- 정지 시: 원형 펄스 -->
                    <div class="user-dot" style="
                        position: absolute;
                        width: 20px; 
                        height: 20px; 
                        background: #00D4AA; 
                        border: 3px solid white; 
                        border-radius: 50%; 
                        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                        animation: pulse 2s infinite;
                        transition: opacity 0.3s;
                    "></div>
                    
                    <!-- 이동 시: 방향 화살표 (SVG) -->
                    <svg id="user-heading-arrow" class="user-heading-arrow" viewBox="0 0 24 24" style="
                        position: absolute;
                        width: 36px; 
                        height: 36px; 
                        display: none; 
                        filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
                        transition: transform 0.3s ease, opacity 0.3s;
                        transform-origin: center center; 
                    ">
                        <!-- 예각 이등변 삼각형 + 오목한 밑변 (Paper Airplane) -->
                        <path d="M12 2L4.5 20.29L5.21 21L12 18L18.79 21L19.5 20.29L12 2Z" fill="#00D4AA" stroke="white" stroke-width="2" stroke-linejoin="round"/>
                    </svg>
                </div>
            `;
        } else if (type === 'destination') {
            el.innerHTML = `
                <div style="
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 32px;
                    height: 32px;
                    background: #E53E3E;
                    border: 3px solid white;
                    border-radius: 50% 50% 50% 0;
                    transform: rotate(-45deg);
                    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                ">
                    <span class="marker-number" style="
                        transform: rotate(45deg); 
                        color: white; 
                        font-weight: bold; 
                        font-size: 14px;
                        margin-bottom: 2px;
                    "></span>
                </div>
            `;
        }

        return el;
    },

    setDestination(coords, name) {
        AppState.destination = { coords, name };
        const mapCoords = ol.proj.fromLonLat(coords);

        // 목적지 마커 (드래그 가능)
        if (!AppState.destinationMarker) {
            const markerElement = this.createMarkerElement('destination');
            markerElement.style.cursor = 'grab';

            AppState.destinationMarker = new ol.Overlay({
                element: markerElement,
                positioning: 'bottom-center',
                stopEvent: false
            });
            AppState.map.addOverlay(AppState.destinationMarker);

            // 드래그 이벤트 설정
            this.setupDestinationDrag(markerElement);
        }

        AppState.destinationMarker.setPosition(mapCoords);

        // 현위치와 목적지가 모두 보이도록 뷰 조정
        if (AppState.currentPosition) {
            const extent = ol.extent.boundingExtent([
                ol.proj.fromLonLat(AppState.currentPosition),
                mapCoords
            ]);
            AppState.map.getView().fit(extent, { padding: [100, 50, 150, 50], maxZoom: 17 });
        }

        // 라벨 갱신
        this.refreshMarkers();

        // 경로 안내 버튼 활성화
        UIManager.enableNavigateButton();
    },

    // 목적지 마커 드래그 기능
    setupDestinationDrag(element) {
        let isDragging = false;

        element.addEventListener('mousedown', (e) => {
            if (AppState.isNavigating) return; // 안내 중엔 드래그 불가
            isDragging = true;
            element.style.cursor = 'grabbing';
            e.stopPropagation();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            const pixel = [e.clientX, e.clientY];
            const coord = AppState.map.getCoordinateFromPixel(pixel);
            if (coord) {
                AppState.destinationMarker.setPosition(coord);
            }
        });

        document.addEventListener('mouseup', () => {
            if (!isDragging) return;
            isDragging = false;
            element.style.cursor = 'grab';

            // 새 위치로 목적지 업데이트
            const newPosition = AppState.destinationMarker.getPosition();
            if (newPosition) {
                const coords = ol.proj.toLonLat(newPosition);
                const addressName = `선택한 위치 (${coords[1].toFixed(5)}, ${coords[0].toFixed(5)})`;
                AppState.destination = { coords, name: addressName };
                document.getElementById('search-input').value = addressName;
                document.getElementById('overlay-destination').textContent = addressName;
            }
        });

        // 터치 이벤트
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
            if (coord) {
                AppState.destinationMarker.setPosition(coord);
            }
        });

        document.addEventListener('touchend', () => {
            if (!isDragging) return;
            isDragging = false;

            const newPosition = AppState.destinationMarker.getPosition();
            if (newPosition) {
                const coords = ol.proj.toLonLat(newPosition);
                const addressName = `선택한 위치 (${coords[1].toFixed(5)}, ${coords[0].toFixed(5)})`;
                AppState.destination = { coords, name: addressName };
                document.getElementById('search-input').value = addressName;
                document.getElementById('overlay-destination').textContent = addressName;
            }
        });
    },

    // 궤적 스타일 (이용자 수에 따른 색상)
    getTrajectoryStyle(feature) {
        const userCount = feature.get('userCount') || 1;
        let color;

        if (userCount <= 3) {
            color = 'rgba(239, 68, 68, 0.3)'; // 빨강 30%
        } else if (userCount <= 10) {
            color = 'rgba(246, 173, 85, 0.5)'; // 주황 50%
        } else {
            color = 'rgba(72, 187, 120, 0.8)'; // 초록 80%
        }

        return new ol.style.Style({
            stroke: new ol.style.Stroke({
                color: color,
                width: 4
            })
        });
    },

    // 더미 궤적 데이터 로드
    loadDummyTrajectories() {
        const center = this.DEFAULT_CENTER;

        // 더미 경로 데이터 (모드별)
        const dummyRoutes = [
            { coords: [[center[0], center[1]], [center[0] + 0.002, center[1] + 0.001]], userCount: 15, mode: 'walking' },
            { coords: [[center[0] + 0.001, center[1] - 0.001], [center[0] + 0.003, center[1]]], userCount: 7, mode: 'walking' },
            { coords: [[center[0] - 0.001, center[1]], [center[0], center[1] + 0.002]], userCount: 2, mode: 'wheelchair' }
        ];

        dummyRoutes.forEach(route => {
            // 현재 모드와 일치하는 궤적만 표시
            if (route.mode === AppState.userMode) {
                const feature = new ol.Feature({
                    geometry: new ol.geom.LineString(
                        route.coords.map(c => ol.proj.fromLonLat(c))
                    ),
                    userCount: route.userCount
                });
                AppState.trajectoryLayer.getSource().addFeature(feature);
            }
        });
    },

    // 꺽쇠(Chevron) 패턴 경로 스타일 함수
    routeStyleFunction(feature, resolution) {
        const styles = [];
        const geometry = feature.getGeometry();

        // 1. 베이스 라인 (진한 주황/빨강 그라데이션 느낌의 단색)
        // 카카오내비/티맵 스타일: 주황색 메인 도로
        styles.push(new ol.style.Style({
            stroke: new ol.style.Stroke({
                color: '#FF6B00', // 진한 주황색
                width: 10,
                lineCap: 'round',
                lineJoin: 'round'
            })
        }));

        // 2. 내부 얇은 선 (입체감)
        styles.push(new ol.style.Style({
            stroke: new ol.style.Stroke({
                color: '#FFA500', // 밝은 주황색
                width: 6,
                lineCap: 'round',
                lineJoin: 'round'
            })
        }));

        // 3. 화살표(Chevron) 패턴
        const length = geometry.getLength();
        // 50픽셀 간격 (해상도 비례, 모바일에서는 더 촘촘하게 보일 수 있음)
        const interval = 50 * resolution;

        let currentDist = 0;

        // 화살표 아이콘 (SVG Data URI)
        // 흰색 꺽쇠
        const arrowSrc = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><path d="M8 5l8 7-8 7" stroke="white" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';

        // 성능 최적화를 위해 Geoemtry 좌표를 순회하며 계산
        // 간단하게: getCoordinateAt 등은 무거울 수 있으므로 forEachSegment 사용

        // 하지만 getCoordinateAt이 구현하기에는 가장 깔끔함.
        // 퍼포먼스 이슈 발생 시 최적화.

        // 애니메이션 오프셋 (흐르는 효과)
        const offset = (Date.now() / 20) % interval;

        // 해상도가 너무 낮으면(줌 아웃) 화살표 생략
        if (resolution > 10) return styles;

        for (let i = offset; i < length; i += interval) {
            const coord = geometry.getCoordinateAt(i / length);
            // 방향 계산: 현재 지점보다 약간 앞의 지점과 각도 계산
            // 끝점 처리 안전장치
            const nextI = Math.min(i + 1, length);
            const nextCoord = geometry.getCoordinateAt(nextI / length);

            const dx = nextCoord[0] - coord[0];
            const dy = nextCoord[1] - coord[1];
            const rotation = Math.atan2(dy, dx);

            styles.push(new ol.style.Style({
                geometry: new ol.geom.Point(coord),
                image: new ol.style.Icon({
                    src: arrowSrc,
                    anchor: [0.5, 0.5],
                    rotateWithView: true,
                    rotation: -rotation, // OpenLayers 회전 방향 주의 (라디안)
                    scale: 0.8
                })
            }));
        }

        return styles;
    },

    // 경로 표시 (OSRM API 활용 - 도로 기반 경로)
    async showRoute(start, end, waypoints = []) {
        try {
            // 좌표 문자열 생성 (start;waypoint1;waypoint2;...;end)
            const points = [start, ...waypoints, end];
            const coordString = points.map(p => `${p[0]},${p[1]}`).join(';');

            const profile = AppState.userMode === 'wheelchair' ? 'foot' : 'foot';
            const url = `https://router.project-osrm.org/route/v1/${profile}/${coordString}?overview=full&geometries=geojson`;

            const response = await fetch(url);
            const data = await response.json();

            if (data.routes && data.routes.length > 0) {
                // HUD 표시용 경로 데이터 저장
                AppState.activeRoute = data.routes[0];

                const routeGeometry = data.routes[0].geometry;
                const coordinates = routeGeometry.coordinates.map(coord =>
                    ol.proj.fromLonLat(coord)
                );

                const feature = new ol.Feature({
                    geometry: new ol.geom.LineString(coordinates)
                });

                AppState.routeLayer.getSource().clear();
                AppState.routeLayer.getSource().addFeature(feature);

                // 경로가 보이도록 뷰 조정
                const extent = feature.getGeometry().getExtent();
                AppState.map.getView().fit(extent, { padding: [100, 50, 150, 50], maxZoom: 17 });
            } else {
                console.warn('경로를 찾을 수 없습니다.');
                this.showStraightRoute(start, end);
            }
        } catch (error) {
            console.warn('라우팅 API 오류:', error);
            this.showStraightRoute(start, end);
        }
    },

    addWaypointMarker(coords) {
        const marker = new ol.Feature({
            geometry: new ol.geom.Point(ol.proj.fromLonLat(coords))
        });

        marker.setStyle(new ol.style.Style({
            image: new ol.style.Circle({
                radius: 10,
                fill: new ol.style.Fill({ color: '#F6AD55' }), // 주황색 (경유지)
                stroke: new ol.style.Stroke({ color: '#fff', width: 2 })
            }),
            text: new ol.style.Text({
                text: `${AppState.waypoints.length}`, // 임시 (refreshMarkers에서 덮어씌워짐)
                font: 'bold 12px sans-serif',
                fill: new ol.style.Fill({ color: '#fff' }),
                offsetY: 1
            })
        }));

        const layer = new ol.layer.Vector({
            source: new ol.source.Vector({
                features: [marker]
            }),
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

    refreshMarkers() {
        // 경유지 마커 번호 업데이트 (1, 2, 3...)
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

        // 목적지 마커 업데이트 (Overlay - .marker-number)
        if (AppState.destinationMarker) {
            const num = AppState.waypoints.length + 1;
            const el = AppState.destinationMarker.getElement();
            const numEl = el.querySelector('.marker-number');
            if (numEl) {
                if (AppState.waypoints.length > 0) {
                    numEl.textContent = `${num}`;
                    numEl.style.display = 'block';
                } else {
                    // 경유지가 없으면 번호 숨김 (초기 목적지는 번호 없음)
                    numEl.style.display = 'none';
                }
            }
        }
    },

    // 폴백: 직선 경로 표시
    showStraightRoute(start, end) {
        const feature = new ol.Feature({
            geometry: new ol.geom.LineString([
                ol.proj.fromLonLat(start),
                ol.proj.fromLonLat(end)
            ])
        });
        AppState.routeLayer.getSource().clear();
        AppState.routeLayer.getSource().addFeature(feature);
    }
};

// ========================================
// UI 관리
// ========================================
const UIManager = {
    init() {
        this.bindEvents();
        this.initProfile(); // 프로필 초기화
        this.loadSavedSettings();
    },

    initProfile() {
        // 저장된 프로필 로드 or 랜덤 생성
        let nickname = Utils.loadState('userNickname');
        let profileImg = Utils.loadState('userProfileImg');

        if (!nickname) {
            nickname = Utils.generateRandomNickname();
            Utils.saveState('userNickname', nickname);
        }
        if (!profileImg) {
            profileImg = Utils.getRandomProfileImage();
            Utils.saveState('userProfileImg', profileImg);
        }

        const nicknameEl = document.getElementById('profile-nickname');
        const imgEl = document.getElementById('profile-img');

        if (nicknameEl) nicknameEl.value = nickname;
        if (imgEl) imgEl.src = profileImg;

        // 별명 수정 포커스 아웃 시 저장
        nicknameEl?.addEventListener('blur', () => {
            nicknameEl.setAttribute('readonly', true);
            Utils.saveState('userNickname', nicknameEl.value);
        });

        nicknameEl?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') nicknameEl.blur();
        });
    },

    bindEvents() {
        // 온보딩 - 권한 다음 버튼
        document.getElementById('permission-next-btn')?.addEventListener('click', () => {
            Utils.showScreen('mode-screen');
        });

        // 온보딩 - 모드 선택
        document.querySelectorAll('.mode-option').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.mode-option').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                AppState.userMode = btn.dataset.mode;
            });
        });

        // 온보딩 - 시작하기
        document.getElementById('mode-next-btn')?.addEventListener('click', () => {
            Utils.saveState('userMode', AppState.userMode);
            Utils.saveState('onboardingComplete', true);
            Utils.showScreen('main-screen');
            MapManager.init();
            this.updateModeIndicator();
        });

        // 메뉴 열기/닫기
        document.getElementById('menu-btn')?.addEventListener('click', () => this.openMenu());
        document.getElementById('close-menu-btn')?.addEventListener('click', () => this.closeMenu());
        document.getElementById('menu-overlay')?.addEventListener('click', () => this.closeMenu());

        // 메뉴 아이템
        document.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', () => {
                const action = item.dataset.action;
                this.handleMenuAction(action);
            });
        });

        // 검색
        document.getElementById('search-btn')?.addEventListener('click', () => this.handleSearch());
        const searchInput = document.getElementById('search-input');
        const clearBtn = document.getElementById('search-clear-btn');

        searchInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleSearch();
        });

        // 검색어 입력 시 X 버튼 표시/숨김
        searchInput?.addEventListener('input', (e) => {
            if (e.target.value.length > 0) {
                clearBtn?.classList.remove('hidden');
            } else {
                clearBtn?.classList.add('hidden');
            }
        });

        // X 버튼 클릭 시 초기화
        clearBtn?.addEventListener('click', () => {
            if (searchInput) {
                searchInput.value = '';
                searchInput.focus();
                clearBtn.classList.add('hidden');
            }
        });

        // 경로 안내 버튼
        document.getElementById('navigate-btn')?.addEventListener('click', () => this.handleNavigate());

        // 대시보드 버튼 (종료, 신고)
        document.getElementById('stop-nav-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.handleNavigate(true); // 강제 종료
        });

        document.getElementById('report-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            alert('🚨 해당 지점의 정보 오류가 접수되었습니다.\n(경사도, 노면 상태 등)');
        });

        // 오버레이 설정
        document.getElementById('opacity-slider')?.addEventListener('input', (e) => {
            const value = e.target.value;
            AppState.overlayOpacity = parseInt(value);
            document.getElementById('opacity-value').textContent = value;
            Utils.updateCSSVar('--overlay-opacity', (100 - value) / 100);
            Utils.saveState('overlayOpacity', value);
        });

        document.getElementById('close-settings-btn')?.addEventListener('click', () => {
            document.getElementById('overlay-settings-modal').classList.add('hidden');
        });

        // 플로팅 오버레이 닫기
        document.getElementById('close-overlay-btn')?.addEventListener('click', () => {
            document.getElementById('floating-overlay').classList.add('hidden');
        });

        // 프로필 - 별명 수정
        document.getElementById('edit-nickname-btn')?.addEventListener('click', () => {
            const el = document.getElementById('profile-nickname');
            if (el) {
                el.removeAttribute('readonly');
                el.focus();
            }
        });

        // 프로필 - 사진 변경
        const fileInput = document.getElementById('profile-img-input');
        document.getElementById('edit-profile-img-btn')?.addEventListener('click', () => {
            fileInput?.click();
        });

        fileInput?.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                const reader = new FileReader();
                reader.onload = (evt) => {
                    const imgData = evt.target.result;
                    document.getElementById('profile-img').src = imgData;
                    Utils.saveState('userProfileImg', imgData);
                };
                reader.readAsDataURL(e.target.files[0]);
            }
        });

        // 맵 터치 시 사이드바 닫기 (오버레이)
        document.getElementById('menu-overlay')?.addEventListener('touchmove', (e) => e.preventDefault());

        // 플로팅 오버레이 드래그
        this.initOverlayDrag();

        // 검색 자동완성
        this.initSearchSuggestions();

        // 경유지 모달 이벤트
        this.initWaypointModal();
    },

    initSearchSuggestions() {
        const input = document.getElementById('search-input');
        const list = document.getElementById('search-suggestions');

        if (!input || !list) return;

        const debouncedSearch = Utils.debounce(async (query) => {
            if (query.length < 2) {
                list.classList.remove('visible');
                return;
            }

            try {
                const response = await fetch(`/api/search?query=${encodeURIComponent(query)}`);
                const data = await response.json();

                list.innerHTML = '';
                if (data.documents && data.documents.length > 0) {
                    data.documents.forEach(doc => {
                        const item = document.createElement('li');
                        item.className = 'suggestion-item';
                        item.innerHTML = `
                            <div class="suggestion-name">${doc.place_name}</div>
                            <div class="suggestion-address">${doc.road_address_name || doc.address_name}</div>
                        `;
                        item.addEventListener('click', () => {
                            const coords = [parseFloat(doc.x), parseFloat(doc.y)];
                            MapManager.setDestination(coords, doc.place_name);
                            input.value = doc.place_name;
                            list.classList.remove('visible');
                        });
                        list.appendChild(item);
                    });
                    list.classList.add('visible');
                } else {
                    list.classList.remove('visible');
                }
            } catch (e) {
                console.error('Suggestion Error:', e);
            }
        }, 300);

        input.addEventListener('input', (e) => debouncedSearch(e.target.value));

        // 외부 클릭 시 닫기
        document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !list.contains(e.target)) {
                list.classList.remove('visible');
            }
        });
    },

    initWaypointModal() {
        const modal = document.getElementById('waypoint-modal');
        const btns = modal?.querySelectorAll('.waypoint-btn');

        btns?.forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.action;
                this.handleWaypointAction(action);
            });
        });

        // 취소 버튼
        document.getElementById('close-waypoint-btn')?.addEventListener('click', () => {
            this.handleWaypointAction('cancel');
        });
    },

    showWaypointModal(coords) {
        AppState.pendingWaypoint = coords;
        document.getElementById('waypoint-modal').classList.remove('hidden');
    },

    handleWaypointAction(action) {
        const modal = document.getElementById('waypoint-modal');
        modal.classList.add('hidden');

        if (action === 'new-dest' && AppState.pendingWaypoint) {
            // 현재 안내 종료하고 새 목적지 설정
            this.handleNavigate(false); // 안내 중지

            // 잠시 후 새 목적지 설정 (안내 종료 처리 대기)
            setTimeout(() => {
                MapManager.setDestinationByClick(AppState.pendingWaypoint);
                AppState.pendingWaypoint = null;
            }, 300);
        }
        // cancel은 그냥 닫기만 함
    },

    loadSavedSettings() {
        // 저장된 설정 로드
        AppState.userMode = Utils.loadState('userMode', 'walking');
        AppState.overlayOpacity = Utils.loadState('overlayOpacity', 30);

        // 온보딩 완료 여부 확인
        const onboardingComplete = Utils.loadState('onboardingComplete', false);

        // 투명도 슬라이더 초기값
        const slider = document.getElementById('opacity-slider');
        if (slider) {
            slider.value = AppState.overlayOpacity;
            document.getElementById('opacity-value').textContent = AppState.overlayOpacity;
            Utils.updateCSSVar('--overlay-opacity', (100 - AppState.overlayOpacity) / 100);
        }

        return onboardingComplete;
    },

    updateModeIndicator() {
        const indicator = document.getElementById('mode-indicator');
        const menuIcon = document.getElementById('current-mode-icon');
        const icon = AppState.userMode === 'wheelchair' ? '♿' : '🚶';

        if (indicator) indicator.textContent = icon;
        if (menuIcon) menuIcon.textContent = icon;
    },

    openMenu() {
        document.getElementById('side-menu')?.classList.add('open');
        document.getElementById('menu-overlay')?.classList.add('visible');
    },

    closeMenu() {
        document.getElementById('side-menu')?.classList.remove('open');
        document.getElementById('menu-overlay')?.classList.remove('visible');
    },

    handleMenuAction(action) {
        this.closeMenu();

        switch (action) {
            case 'my-records':
                this.showMyRecords();
                break;
            case 'mode-change':
                // 모드 토글
                AppState.userMode = AppState.userMode === 'walking' ? 'wheelchair' : 'walking';
                Utils.saveState('userMode', AppState.userMode);
                this.updateModeIndicator();
                // 궤적 레이어 새로고침
                AppState.trajectoryLayer.getSource().clear();
                MapManager.loadDummyTrajectories();
                alert(`모드가 '${AppState.userMode === 'walking' ? '보행' : '휠체어'} 모드'로 변경되었습니다.`);
                break;
            case 'overlay-settings':
                document.getElementById('overlay-settings-modal')?.classList.remove('hidden');
                break;
        }
    },

    // 나의 기록 (Alert Mock)
    showMyRecords() {
        // 실제 데이터 대신 가상의 통계와 랭킹 표시
        const totalDist = 42.5; // km
        const walking = 30.2;
        const vehicle = 12.3;

        const myRank = 142;
        const totalUsers = 2350;
        const percent = ((myRank / totalUsers) * 100).toFixed(1);

        const msg = `
🏆 나의 기록 (Global Rank #${myRank})
상위 ${percent}%에 위치하고 있습니다!

📏 총 이동 거리: ${totalDist}km
  - 🚶 걸어서: ${walking}km
  - 🚗 차 타고: ${vehicle}km

[🥇 리더보드 Top 3]
1. 화성을 폭격하는 망고 (1,230km)
2. 달리는 돈까스 (980km)
3. 춤추는 호랑이 (850km)
...
${myRank}. ${document.getElementById('profile-nickname').value} (${totalDist}km)
        `;
        alert(msg.trim());
    },

    async handleSearch() {
        const input = document.getElementById('search-input');
        const query = input?.value.trim();

        if (!query) {
            alert('주소를 입력해주세요.');
            return;
        }

        try {
            // 로컬 파이썬 서버의 프록시 API 호출
            const response = await fetch(`/api/search?query=${encodeURIComponent(query)}`);
            if (!response.ok) throw new Error('Network response was not ok');

            const data = await response.json();

            if (data.documents && data.documents.length > 0) {
                const doc = data.documents[0];
                const coords = [parseFloat(doc.x), parseFloat(doc.y)]; // [경도, 위도]

                MapManager.setDestination(coords, query);
                document.getElementById('overlay-destination').textContent = query;
            } else {
                alert('검색 결과가 없습니다.');
            }
        } catch (e) {
            console.error('Search Error:', e);
            alert('검색 중 오류 발생 (Server Proxy): ' + e.message);
        }
    },

    enableNavigateButton() {
        const btn = document.getElementById('navigate-btn');
        if (btn) {
            btn.classList.remove('disabled');
            btn.querySelector('.btn-text').textContent = '경로 안내 시작';
        }
    },

    waypoints: [], // 경유지 목록
    waypointMarkers: [], // 경유지 마커 목록

    // ... (기존 변수들)

    // 경로 표시 (V-world/OSM -> OSRM)
    async showRoute(start, end, waypoints = []) {
        try {
            // 좌표 문자열 생성 (start;waypoint1;waypoint2;...;end)
            const points = [start, ...waypoints, end];
            const coordString = points.map(p => `${p[0]},${p[1]}`).join(';');

            const profile = AppState.userMode === 'wheelchair' ? 'foot' : 'foot';
            const url = `https://router.project-osrm.org/route/v1/${profile}/${coordString}?overview=full&geometries=geojson`;

            const response = await fetch(url);
            const data = await response.json();

            if (data.routes && data.routes.length > 0) {
                const routeGeometry = data.routes[0].geometry;
                const coordinates = routeGeometry.coordinates.map(coord =>
                    ol.proj.fromLonLat(coord)
                );

                const feature = new ol.Feature({
                    geometry: new ol.geom.LineString(coordinates)
                });

                AppState.routeLayer.getSource().clear();
                AppState.routeLayer.getSource().addFeature(feature);

                // 경로가 보이도록 뷰 조정
                const extent = feature.getGeometry().getExtent();
                AppState.map.getView().fit(extent, { padding: [100, 50, 150, 50], maxZoom: 17 });
            } else {
                console.warn('경로를 찾을 수 없습니다.');
                this.showStraightRoute(start, end);
            }
        } catch (error) {
            console.warn('라우팅 API 오류:', error);
            this.showStraightRoute(start, end);
        }
    },

    addWaypointMarker(coords) {
        const marker = new ol.Feature({
            geometry: new ol.geom.Point(ol.proj.fromLonLat(coords))
        });

        marker.setStyle(new ol.style.Style({
            image: new ol.style.Circle({
                radius: 8,
                fill: new ol.style.Fill({ color: '#F6AD55' }), // 주황색 (경유지)
                stroke: new ol.style.Stroke({ color: '#fff', width: 2 })
            }),
            text: new ol.style.Text({
                text: `${AppState.waypoints.length}`, // 경유지 순서
                font: '12px sans-serif',
                fill: new ol.style.Fill({ color: '#fff' }),
                offsetY: 1
            })
        }));

        const layer = new ol.layer.Vector({
            source: new ol.source.Vector({
                features: [marker]
            }),
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

    refreshMarkers() {
        AppState.waypointMarkers.forEach((layer, index) => {
            const feature = layer.getSource().getFeatures()[0];
            const style = feature.getStyle();
            if (style && style.getText) {
                style.getText().setText(`${index + 1}`);
                feature.changed();
            }
        });

        if (AppState.destinationMarker) {
            const num = AppState.waypoints.length + 1;
            const el = AppState.destinationMarker.getElement();
            const numEl = el.querySelector('.marker-number');
            if (numEl) {
                numEl.textContent = `${num}`;
                numEl.style.display = 'block';
            }
        }
    },

    // ... (UIManager 내 handleWaypointAction 업데이트)
    handleWaypointAction(action) {
        const modal = document.getElementById('waypoint-modal');
        modal.classList.add('hidden');

        if (action === 'cancel') {
            AppState.pendingWaypoint = null;
            return;
        }

        if (AppState.pendingWaypoint) {
            if (action === 'waypoint') {
                // 경유지 추가 로직: 목적지보다 '먼저' 들름
                const coords = AppState.pendingWaypoint;
                AppState.waypoints.push(coords);
                MapManager.addWaypointMarker(coords);

                // 경로 재계산
                MapManager.showRoute(AppState.currentPosition, AppState.destination.coords, AppState.waypoints);
                AppState.pendingWaypoint = null;

            } else if (action === 'new-dest') {
                // 새 목적지로 변경
                this.handleNavigate(true); // 강제 중지 및 리셋
                setTimeout(() => {
                    MapManager.setDestinationByClick(AppState.pendingWaypoint);
                    AppState.pendingWaypoint = null;
                }, 300);

            } else if (action === 'final-dest') {
                // 최종 목적지로 추가 (기존 목적지를 경유지로 전환)
                // 1. 현재 목적지 좌표를 경유지로 추가
                const oldDestCoords = AppState.destination.coords;
                AppState.waypoints.push(oldDestCoords);
                MapManager.addWaypointMarker(oldDestCoords);

                // 2. 새로운 지점을 목적지로 설정
                AppState.destination.coords = AppState.pendingWaypoint;

                // 마커 위치 이동 (Overlay 객체이므로 setPosition 사용)
                if (AppState.destinationMarker) {
                    AppState.destinationMarker.setPosition(ol.proj.fromLonLat(AppState.pendingWaypoint));
                }

                // 3. 경로 재계산
                MapManager.showRoute(AppState.currentPosition, AppState.destination.coords, AppState.waypoints);
                MapManager.refreshMarkers(); // 번호 업데이트
                AppState.pendingWaypoint = null;
            }
        }
    },

    handleNavigate(forceStop = false) {
        const btn = document.getElementById('navigate-btn');
        if (btn?.classList.contains('disabled')) return;

        if (forceStop || AppState.isNavigating) {
            // 안내 중지
            AppState.isNavigating = false;
            AppState.isUserInteracting = false;
            btn.classList.remove('active');
            btn.querySelector('.btn-text').textContent = '경로 안내 시작';
            btn.style.background = ''; // 배경색 초기화


            // HUD 숨김 & 검색창 복원
            document.body.classList.remove('search-hidden');
            document.getElementById('navigation-hud')?.classList.add('hidden');

            // 대시보드 숨김 & 버튼 복원
            document.getElementById('dashboard-container')?.classList.add('hidden');
            btn.classList.remove('hidden');

            // 슬로프 시뮬레이션 중지
            if (AppState.slopeInterval) {
                clearInterval(AppState.slopeInterval);
                AppState.slopeInterval = null;
            }

            // 뷰 리셋 타이머 해제
            if (AppState.viewResetTimer) {
                clearTimeout(AppState.viewResetTimer);
                AppState.viewResetTimer = null;
            }

            // 경로 데이터 저장
            if (AppState.routeHistory.length > 0) {
                console.log('경로 데이터 저장됨:', {
                    mode: AppState.userMode,
                    points: AppState.routeHistory.length,
                    data: AppState.routeHistory
                });
                // DataCollector.saveRoute({ mode: AppState.userMode, points: AppState.routeHistory.length });
            }

            AppState.routeLayer.getSource().clear();
            MapManager.clearWaypoints(); // 경유지 제거

            btn.style.background = '';
        } else {
            // 안내 시작
            AppState.isNavigating = true;
            AppState.isUserInteracting = false;
            AppState.routeHistory = [];

            // HUD 표시 & 검색창 숨김
            document.body.classList.add('search-hidden');
            document.getElementById('navigation-hud')?.classList.remove('hidden');

            // 대시보드 표시 & 버튼 숨김
            document.getElementById('dashboard-container')?.classList.remove('hidden');
            btn.classList.add('hidden'); // 기존 큰 버튼 숨김

            // 대시보드 초기 정보 설정
            this.updateDashboard(AppState.userMode);

            // 휠체어 모드일 경우 경사도 시뮬레이션 시작
            if (AppState.userMode === 'wheelchair') {
                this.startSlopeSimulation();
            }

            MapManager.clearWaypoints();
            // 새 경로 계산 및 표시
            MapManager.showRoute(AppState.currentPosition, AppState.destination.coords);

            MapManager.fitViewToRoute();

            // btn.querySelector('.btn-text').textContent = '안내 중지'; 
            // -> 이제 하단 바 자체가 바뀌므로 텍스트 변경 불필요

            // 초기 HUD 업데이트
            if (AppState.activeRoute) {
                this.updateNavigationHUD(AppState.activeRoute);
            }
        }
    },

    updateDashboard(mode) {
        const primaryEl = document.getElementById('dash-primary');
        const secondaryEl = document.getElementById('dash-secondary');

        // 실제 데이터가 없으므로 Mock Data 사용
        if (mode === 'walking') {
            // 보행(배달) 모드
            // 목적지 주소가 있다면 그것을 표시, 없으면 임의의 상세주소
            const destName = document.getElementById('search-input').value || '임의의 목적지';
            primaryEl.textContent = `[도착지] ${destName} 101동 1204호`; // 가상의 상세주소
            primaryEl.style.color = 'var(--text-primary)';
            secondaryEl.textContent = '📢 "문 앞에 두고 노크해주세요"';
        } else {
            // 휠체어 모드
            // 초기값
            primaryEl.textContent = '현재 경사도: 0° (평지)';
            primaryEl.style.color = '#48BB78'; // Green
            secondaryEl.textContent = '전방 50m 구간도 완만합니다 👍';
        }
    },

    startSlopeSimulation() {
        if (AppState.slopeInterval) clearInterval(AppState.slopeInterval);

        AppState.slopeInterval = setInterval(() => {
            const primaryEl = document.getElementById('dash-primary');
            const secondaryEl = document.getElementById('dash-secondary');
            if (!primaryEl) return;

            // -2 ~ 10도 사이 랜덤
            const slope = Math.floor(Math.random() * 12) - 2;

            let status = '(평지)';
            let color = '#48BB78'; // Green

            if (slope >= 5) {
                status = '(급경사 ⚠️)';
                color = '#F56565'; // Red
            } else if (slope >= 3) {
                status = '(오르막)';
                color = '#ED8936'; // Orange
            }

            primaryEl.textContent = `현재 경사도: ${slope}° ${status}`;
            primaryEl.style.color = color;

            if (slope >= 5) {
                secondaryEl.textContent = '🚨 전동 휠체어 출력을 높이세요';
            } else {
                secondaryEl.textContent = '안전한 주행 구간입니다';
            }

        }, 3000); // 3초마다 갱신
    },

    updateNavigationHUD(route) {
        if (!route) return;

        // 1. 전체 정보 (남은 거리/시간)
        const totalDist = (route.distance / 1000).toFixed(1); // km
        const totalTime = Math.ceil(route.duration / 60); // 분

        const totalDistEl = document.getElementById('nav-total-dist');
        const totalTimeEl = document.getElementById('nav-total-time');

        if (totalDistEl) totalDistEl.textContent = `${totalDist}km`;
        if (totalTimeEl) totalTimeEl.textContent = `${totalTime}분`;

        // 2. 턴 정보 (단순화: OSRM Steps 활용)
        if (route.legs && route.legs[0].steps && route.legs[0].steps.length > 0) {
            const steps = route.legs[0].steps;
            // 0번은 출발지, 1번이 첫 번째 턴
            const nextStep = steps[1] || steps[0];
            const afterStep = steps[2];

            // 다음 턴
            const modifier = nextStep.maneuver.modifier || 'straight';
            const nextIconEl = document.getElementById('nav-next-turn-icon');
            const nextDistEl = document.getElementById('nav-next-dist');

            if (nextIconEl) nextIconEl.textContent = this.getTurnIcon(modifier);
            if (nextDistEl) nextDistEl.textContent = `${nextStep.distance < 1000 ? Math.round(nextStep.distance) + 'm' : (nextStep.distance / 1000).toFixed(1) + 'km'}`;

            // 그 다음 턴
            const secondIconEl = document.getElementById('nav-second-icon');
            const secondDistEl = document.getElementById('nav-second-dist');

            if (afterStep) {
                const afterMod = afterStep.maneuver.modifier || 'straight';
                if (secondIconEl) secondIconEl.textContent = this.getTurnIcon(afterMod);
                if (secondDistEl) secondDistEl.textContent = `${Math.round(afterStep.distance)}m`;
            } else {
                if (secondIconEl) secondIconEl.textContent = '🏁';
                if (secondDistEl) secondDistEl.textContent = '0m';
            }
        }
    },

    getTurnIcon(modifier) {
        const icons = {
            'left': '⬅️', 'right': '➡️', 'sharp left': '↙️', 'sharp right': '↘️',
            'slight left': '↖️', 'slight right': '↗️', 'straight': '⬆️', 'uturn': '↩️'
        };
        return icons[modifier] || '⬆️';
    },

    initOverlayDrag() {
        const overlay = document.getElementById('floating-overlay');
        if (!overlay) return;

        let isDragging = false;
        let startX, startY, startLeft, startTop;

        overlay.addEventListener('mousedown', (e) => {
            if (e.target.closest('.resize-handle') || e.target.closest('.icon-btn')) return;

            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            startLeft = overlay.offsetLeft;
            startTop = overlay.offsetTop;
            overlay.style.cursor = 'grabbing';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;

            overlay.style.left = `${startLeft + deltaX}px`;
            overlay.style.top = `${startTop + deltaY}px`;
            overlay.style.right = 'auto';
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
            overlay.style.cursor = 'move';
        });

        // 터치 이벤트
        overlay.addEventListener('touchstart', (e) => {
            if (e.target.closest('.resize-handle') || e.target.closest('.icon-btn')) return;

            isDragging = true;
            const touch = e.touches[0];
            startX = touch.clientX;
            startY = touch.clientY;
            startLeft = overlay.offsetLeft;
            startTop = overlay.offsetTop;
        });

        document.addEventListener('touchmove', (e) => {
            if (!isDragging) return;

            const touch = e.touches[0];
            const deltaX = touch.clientX - startX;
            const deltaY = touch.clientY - startY;

            overlay.style.left = `${startLeft + deltaX}px`;
            overlay.style.top = `${startTop + deltaY}px`;
            overlay.style.right = 'auto';
        });

        document.addEventListener('touchend', () => {
            isDragging = false;
        });
    }
};

// ========================================
// 데이터 취합 관리 (IndexedDB + REST API 시뮬레이션)
// ========================================
const DataCollector = {
    DB_NAME: 'BalgilMapDB',
    STORE_NAME: 'routes',

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, 1);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.STORE_NAME)) {
                    db.createObjectStore(this.STORE_NAME, { keyPath: 'id', autoIncrement: true });
                }
            };
        });
    },

    async saveRoute(routeData) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORE_NAME], 'readwrite');
            const store = transaction.objectStore(this.STORE_NAME);

            const data = {
                mode: routeData.mode,
                points: routeData.points,
                timestamp: Date.now()
            };

            const request = store.add(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    // 서버 전송 시뮬레이션 (실제로는 REST API 호출)
    async syncToServer() {
        console.log('서버 동기화 시뮬레이션...');
        // 실제 구현 시:
        // const routes = await this.getAllRoutes();
        // await fetch('/api/routes', { method: 'POST', body: JSON.stringify(routes) });
    }
};

// ========================================
// 앱 초기화
// ========================================
document.addEventListener('DOMContentLoaded', async () => {
    // 스플래시 화면 표시 후 온보딩 또는 메인 화면으로 전환
    setTimeout(async () => {
        UIManager.init();

        try {
            await DataCollector.init();
        } catch (e) {
            console.warn('IndexedDB 초기화 실패:', e);
        }

        const onboardingComplete = UIManager.loadSavedSettings();

        if (onboardingComplete) {
            Utils.showScreen('main-screen');
            MapManager.init();
            UIManager.updateModeIndicator();
        } else {
            Utils.showScreen('permission-screen');
        }
    }, 2000);
});
