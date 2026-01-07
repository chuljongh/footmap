// ========================================
// UI 관리 (UIManager)
// ========================================
const UIManager = {
    init() {
        this.bindEvents();
        this.initProfile();
        this.loadSavedSettings();
        this.initClipboardListener(); // 클립보드 자동감지 시작
    },

    // 클립보드 감지 리스너 (포커스 시) - 배달원 모드 (Zero-Touch)
    initClipboardListener() {
        if (!navigator.clipboard) return;

        window.addEventListener('focus', async () => {
            try {
                const text = await navigator.clipboard.readText();
                // 1. 텍스트 유효성 및 중복 검사
                if (text && text.trim().length > 0 && text !== AppState.lastClipboardText) {
                    // 주소가 아닌 것 같은 짧은 단어는 제외 (단, 배달지 주소는 '101호' 같이 짧을수도 있어 2글자로 완화)
                    if (text.length < 2) return;

                    AppState.lastClipboardText = text;

                    // 2. [기존 경로 삭제] (네비게이션 중이었다면 종료)
                    if (AppState.isNavigating) {
                        this.handleNavigate(true); // forceStop = true
                    } else {
                        // 목적지가 설정되어 있던 상태라면 초기화
                        MapManager.clearDestination();
                    }

                    // 3. [주소 검색]
                    const searchInput = document.getElementById('search-input');
                    if (searchInput) {
                        searchInput.value = text;
                        // 검색 실행 및 결과 대기
                        const success = await this.handleSearch();

                        // 4. [경로 안내 시작] (검색 성공 시)
                        if (success) {
                            // 잠시 딜레이 후 안내 시작 (지도 이동 애니메이션 등 고려)
                            setTimeout(() => {
                                this.handleNavigate();
                                console.log('Zero-Touch Navigation Started for:', text);
                            }, 500);
                        }
                    }
                }
            } catch (e) {
                // 권한 거부 등 무시
                console.log('Clipboard read failed:', e);
            }
        });
    },

    initProfile() {
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

        AppState.userProfile = { nickname, profileImg }; // 전역 상태에 저장

        const nicknameEl = document.getElementById('profile-nickname');
        const imgEl = document.getElementById('profile-img');

        if (nicknameEl) nicknameEl.value = nickname;
        if (imgEl) imgEl.src = profileImg;

        nicknameEl?.addEventListener('blur', () => {
            nicknameEl.setAttribute('readonly', true);
            Utils.saveState('userNickname', nicknameEl.value);
            AppState.userProfile.nickname = nicknameEl.value;
        });

        nicknameEl?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') nicknameEl.blur();
        });
    },

    bindEvents() {
        // 온보딩
        document.getElementById('permission-next-btn')?.addEventListener('click', () => Utils.showScreen('mode-screen'));
        document.querySelectorAll('.mode-option').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.mode-option').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                AppState.userMode = btn.dataset.mode;
            });
        });
        document.getElementById('mode-next-btn')?.addEventListener('click', () => {
            Utils.saveState('userMode', AppState.userMode);
            Utils.saveState('onboardingComplete', true);
            Utils.showScreen('main-screen');
            MapManager.init();
            this.updateModeIndicator();
        });

        // 메뉴
        document.getElementById('menu-btn')?.addEventListener('click', () => this.openMenu());
        document.getElementById('close-menu-btn')?.addEventListener('click', () => this.closeMenu());
        document.getElementById('menu-overlay')?.addEventListener('click', () => this.closeMenu());
        document.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', () => this.handleMenuAction(item.dataset.action));
        });

        // 검색
        document.getElementById('search-btn')?.addEventListener('click', () => this.handleSearch());
        const searchInput = document.getElementById('search-input');
        const clearBtn = document.getElementById('search-clear-btn');
        searchInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleSearch();
        });
        // Duplicate listener removed - handled in initSearchSuggestions

        clearBtn?.addEventListener('click', () => {
            if (searchInput) {
                searchInput.value = '';
                searchInput.focus();
                // hidden 클래스 토글 불필요 - CSS가 :placeholder-shown으로 처리
            }
        });

        // 네비게이션
        document.getElementById('navigate-btn')?.addEventListener('click', () => this.handleNavigate());
        document.getElementById('stop-nav-btn')?.addEventListener('click', (e) => { e.stopPropagation(); this.handleNavigate(true); });
        document.getElementById('report-btn')?.addEventListener('click', (e) => { e.stopPropagation(); alert('🚨 신고되었습니다!'); });

        // 오버레이 설정
        document.getElementById('opacity-slider')?.addEventListener('input', (e) => {
            const val = e.target.value;
            AppState.overlayOpacity = parseInt(val);
            document.getElementById('opacity-value').textContent = val;
            Utils.updateCSSVar('--overlay-opacity', (100 - val) / 100);
            Utils.saveState('overlayOpacity', val);
        });
        document.getElementById('close-settings-btn')?.addEventListener('click', () => document.getElementById('overlay-settings-modal').classList.add('hidden'));
        document.getElementById('close-overlay-btn')?.addEventListener('click', () => document.getElementById('floating-overlay').classList.add('hidden'));

        // 프로필
        document.getElementById('edit-nickname-btn')?.addEventListener('click', () => {
            const el = document.getElementById('profile-nickname');
            if (el) { el.removeAttribute('readonly'); el.focus(); }
        });
        const fileInput = document.getElementById('profile-img-input');
        document.getElementById('edit-profile-img-btn')?.addEventListener('click', () => fileInput?.click());
        fileInput?.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                const reader = new FileReader();
                reader.onload = (evt) => {
                    const imgData = evt.target.result;
                    document.getElementById('profile-img').src = imgData;
                    Utils.saveState('userProfileImg', imgData);
                    AppState.userProfile.profileImg = imgData;
                };
                reader.readAsDataURL(e.target.files[0]);
            }
        });

        this.initOverlayDrag();
        this.initSearchSuggestions();
        this.initWaypointModal();
    },

    // ... (이후 메서드는 기존과 동일, Utils 의존성만 주의)
    initSearchSuggestions() {
        const input = document.getElementById('search-input');
        const list = document.getElementById('search-suggestions');
        const clearBtn = document.getElementById('search-clear-btn');
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
                            if (clearBtn) clearBtn.classList.remove('hidden');
                        });
                        list.appendChild(item);
                    });
                    list.classList.add('visible');
                } else {
                    list.classList.remove('visible');
                }
            } catch (e) {
                console.error(e);
            }
        }, 300);

        input.addEventListener('input', (e) => {
            debouncedSearch(e.target.value);
            // hidden 클래스 토글 불필요 - CSS가 :placeholder-shown으로 처리
        });

        document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !list.contains(e.target)) list.classList.remove('visible');
        });
    },

    initWaypointModal() {
        const modal = document.getElementById('waypoint-modal');
        const btns = modal?.querySelectorAll('.waypoint-btn');
        btns?.forEach(btn => {
            btn.addEventListener('click', () => this.handleWaypointAction(btn.dataset.action));
        });
        document.getElementById('close-waypoint-btn')?.addEventListener('click', () => this.handleWaypointAction('cancel'));
    },

    showWaypointModal(coords) {
        AppState.pendingWaypoint = coords;
        document.getElementById('waypoint-modal').classList.remove('hidden');
    },

    handleWaypointAction(action) {
        const modal = document.getElementById('waypoint-modal');
        modal.classList.add('hidden');

        if (action === 'cancel') {
            AppState.pendingWaypoint = null;
            return;
        }

        if (AppState.pendingWaypoint) {
            if (action === 'waypoint') {
                const coords = AppState.pendingWaypoint;
                AppState.waypoints.push(coords);
                MapManager.addWaypointMarker(coords);
                RouteManager.showRoute(AppState.currentPosition, AppState.destination.coords, AppState.waypoints);
                AppState.pendingWaypoint = null;
            } else if (action === 'new-dest') {
                this.handleNavigate(true);
                setTimeout(() => {
                    MapManager.setDestinationByClick(AppState.pendingWaypoint);
                    AppState.pendingWaypoint = null;
                }, 300);
            } else if (action === 'final-dest') {
                if (!AppState.destination) {
                    alert('기존 목적지가 없습니다. 새 목적지로 설정합니다.');
                    this.handleWaypointAction('new-dest');
                    return;
                }
                const oldDestCoords = AppState.destination.coords;
                const newDestCoords = AppState.pendingWaypoint; // Capture local copy

                AppState.waypoints.push(oldDestCoords);
                MapManager.addWaypointMarker(oldDestCoords);

                // 새로운 최종 목적지 주소 가져오기
                MapManager.getAddressFromCoords(newDestCoords).then(addressName => {
                    AppState.destination = { coords: newDestCoords, name: addressName };
                    if (AppState.destinationMarker) AppState.destinationMarker.setPosition(ol.proj.fromLonLat(newDestCoords));
                    document.getElementById('search-input').value = addressName; // 검색창 업데이트

                    RouteManager.showRoute(AppState.currentPosition, AppState.destination.coords, AppState.waypoints);
                    MapManager.refreshMarkers();
                    UIManager.updateDashboard(AppState.userMode); // 대시보드 즉시 업데이트
                    AppState.pendingWaypoint = null; // Clear inside callback
                });
            }
        }
    },

    loadSavedSettings() {
        AppState.userMode = Utils.loadState('userMode', 'walking');
        AppState.overlayOpacity = Utils.loadState('overlayOpacity', 30);
        const onboardingComplete = Utils.loadState('onboardingComplete', false);

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
        if (action === 'legend-toggle') {
            const btn = document.querySelector(`.menu-item[data-action="${action}"]`);
            if (btn) this.toggleLegend(btn);
            return; // 상세 정보 토글 시에는 메뉴 닫지 않음
        }

        this.closeMenu();
        switch (action) {
            case 'my-records': this.showMyRecords(); break;
            case 'mode-change':
                AppState.userMode = AppState.userMode === 'walking' ? 'wheelchair' : 'walking';
                Utils.saveState('userMode', AppState.userMode);
                this.updateModeIndicator();
                AppState.trajectoryLayer.getSource().clear();
                MapManager.loadDummyTrajectories();
                alert(`모드가 '${AppState.userMode === 'walking' ? '보행' : '휠체어'} 모드'로 변경되었습니다.`);
                break;
            case 'overlay-settings':
                document.getElementById('overlay-settings-modal')?.classList.remove('hidden');
                break;

        }
    },

    toggleLegend(btn) {
        const details = document.getElementById('menu-legend-details');
        if (details) {
            const isHidden = details.classList.contains('hidden');
            if (isHidden) {
                details.classList.remove('hidden');
                btn.classList.add('active');
            } else {
                details.classList.add('hidden');
                btn.classList.remove('active');
            }
        }
    },

    showMyRecords() {
        const modal = document.getElementById('my-records-modal');
        modal.classList.remove('hidden');

        // 탭 이벤트 바인딩 (최초 1회)
        if (!this._recordsTabsBound) {
            this._recordsTabsBound = true;
            modal.querySelectorAll('.tab-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    modal.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    this.loadRecordsTab(btn.dataset.tab);
                });
            });
            modal.querySelector('#close-records-btn').addEventListener('click', () => {
                modal.classList.add('hidden');
            });
        }

        // 기본 탭 로드
        this.loadRecordsTab('routes');
    },

    async loadRecordsTab(tabName) {
        const userId = AppState.userProfile?.nickname || '익명';
        const listEl = document.getElementById('records-list');
        listEl.innerHTML = '<p class="empty-state">불러오는 중...</p>';

        try {
            let items = [];
            let renderFn;

            switch (tabName) {
                case 'routes':
                    const routesRes = await fetch(`/api/users/${encodeURIComponent(userId)}/routes`);
                    items = await routesRes.json();
                    renderFn = this.renderRouteItem;
                    break;
                case 'messages':
                    const msgsRes = await fetch(`/api/users/${encodeURIComponent(userId)}/messages`);
                    items = await msgsRes.json();
                    renderFn = this.renderMessageItem;
                    break;
                case 'comments':
                    const cmtsRes = await fetch(`/api/users/${encodeURIComponent(userId)}/comments`);
                    items = await cmtsRes.json();
                    renderFn = this.renderCommentItem;
                    break;
            }

            if (items.length === 0) {
                listEl.innerHTML = '<p class="empty-state">기록이 없습니다.</p>';
                return;
            }

            listEl.innerHTML = items.map(item => renderFn.call(this, item)).join('');
        } catch (e) {
            console.error('Records load error:', e);
            listEl.innerHTML = '<p class="empty-state">오류가 발생했습니다.</p>';
        }
    },

    renderRouteItem(r) {
        const date = new Date(r.timestamp).toLocaleDateString('ko-KR');
        const dist = r.distance ? r.distance.toFixed(1) + 'km' : '?km';
        const mode = r.mode === 'wheelchair' ? '♿ 휠체어' : '🚶 도보';
        return `
            <div class="record-item">
                <span class="icon">📍</span>
                <div class="info">
                    <div class="title">${dist} · ${mode}</div>
                    <div class="meta">${date}</div>
                </div>
            </div>
        `;
    },

    renderMessageItem(m) {
        const date = new Date(m.timestamp).toLocaleDateString('ko-KR');
        return `
            <div class="record-item">
                <span class="icon">💬</span>
                <div class="info">
                    <div class="title">${m.text}</div>
                    <div class="meta">${date} · 👍 ${m.likes}</div>
                </div>
            </div>
        `;
    },

    renderCommentItem(c) {
        const date = new Date(c.timestamp).toLocaleDateString('ko-KR');
        return `
            <div class="record-item">
                <span class="icon">✏️</span>
                <div class="info">
                    <div class="title">${c.text}</div>
                    <div class="meta">${date}</div>
                </div>
            </div>
        `;
    },

    async handleSearch() {
        const input = document.getElementById('search-input');
        const query = input?.value.trim();
        if (!query) { alert('주소를 입력해주세요.'); return false; }
        try {
            const response = await fetch(`/api/search?query=${encodeURIComponent(query)}`);
            if (!response.ok) throw new Error('Network response was not ok');
            const data = await response.json();
            if (data.documents && data.documents.length > 0) {
                const doc = data.documents[0];
                const coords = [parseFloat(doc.x), parseFloat(doc.y)];
                MapManager.setDestination(coords, query);
                document.getElementById('overlay-destination').textContent = query;
                return true; // Search success
            } else {
                alert('검색 결과가 없습니다.');
                return false;
            }
        } catch (e) {
            console.error(e);
            alert('검색 에러: ' + e.message);
            return false;
        }
    },

    enableNavigateButton() {
        const btn = document.getElementById('navigate-btn');
        if (btn) {
            btn.classList.remove('disabled');
            btn.querySelector('.btn-text').textContent = '경로 안내 시작';
        }
    },

    handleNavigate(forceStop = false) {
        const btn = document.getElementById('navigate-btn');
        if (btn && btn.classList.contains('disabled')) return;

        if (forceStop || AppState.isNavigating) {
            // [STOP NAVIGATION]

            // 1. UI & State Cleanup (Priority)
            AppState.isNavigating = false;
            AppState.isUserInteracting = false;

            if (btn) {
                const textSpan = btn.querySelector('.btn-text');
                if (textSpan) textSpan.textContent = '경로 안내 시작';
                btn.classList.remove('active');
            }

            document.body.classList.remove('search-hidden');
            document.getElementById('navigation-hud')?.classList.add('hidden');
            document.getElementById('dashboard-container')?.classList.add('hidden');
            document.getElementById('pre-nav-actions')?.classList.remove('hidden');

            // 2. Map Cleanup
            if (AppState.slopeInterval) {
                clearInterval(AppState.slopeInterval);
                AppState.slopeInterval = null;
            }
            if (AppState.viewResetTimer) {
                clearTimeout(AppState.viewResetTimer);
                AppState.viewResetTimer = null;
            }

            // Route Layer Clear
            if (AppState.routeLayer) {
                AppState.routeLayer.getSource().clear();
            }
            if (AppState.map) AppState.map.render();

            // 3. Data Saving (Async, Safe)
            try {
                const routeToSave = AppState.activeRoute;
                // Safe copy of history
                const historyToSave = (AppState.routeHistory && Array.isArray(AppState.routeHistory))
                    ? [...AppState.routeHistory]
                    : [];

                if (routeToSave && historyToSave.length > 0) {
                    const userId = AppState.userProfile?.nickname || '익명';
                    const distance = (routeToSave.distance || 0) / 1000;
                    const duration = routeToSave.duration || 0;
                    const startCoords = historyToSave[0]?.coords?.join(',') || '';
                    const endCoords = AppState.destination?.coords?.join(',') || '';

                    fetch(`/api/users/${encodeURIComponent(userId)}/routes`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            distance, duration,
                            mode: AppState.userMode || 'pedestrian',
                            startCoords, endCoords
                        })
                    }).catch(e => console.error('Route save err:', e));
                }
            } catch (err) {
                console.error('Save setup err:', err);
            }

            AppState.activeRoute = null;
            MapManager.clearWaypoints();

            // Destination Clear Timer
            if (AppState.destinationClearTimer) clearTimeout(AppState.destinationClearTimer);
            AppState.destinationClearTimer = setTimeout(() => {
                MapManager.clearDestination();
                AppState.destinationClearTimer = null;
            }, 5000);

        } else {
            // [START NAVIGATION]
            if (AppState.destinationClearTimer) {
                clearTimeout(AppState.destinationClearTimer);
                AppState.destinationClearTimer = null;
            }

            AppState.isNavigating = true;
            AppState.isUserInteracting = false;
            AppState.routeHistory = [];

            document.body.classList.add('search-hidden');
            document.getElementById('navigation-hud')?.classList.remove('hidden');
            document.getElementById('dashboard-container')?.classList.remove('hidden');
            document.getElementById('pre-nav-actions')?.classList.add('hidden');

            this.updateDashboard(AppState.userMode);
            if (AppState.userMode === 'wheelchair') this.startSlopeSimulation();

            MapManager.clearWaypoints();
            RouteManager.showRoute(AppState.currentPosition, AppState.destination.coords, AppState.waypoints);
            MapManager.fitViewToRoute();

            if (AppState.activeRoute) this.updateNavigationHUD(AppState.activeRoute);
        }
    },

    updateDashboard(mode) {
        const primaryEl = document.getElementById('dash-primary');
        const secondaryEl = document.getElementById('dash-secondary');
        if (AppState.addressToggleInterval) { clearInterval(AppState.addressToggleInterval); AppState.addressToggleInterval = null; }

        let showDest = true;
        let currentAddressCache = null;
        let lastFetchTime = 0;

        const updateAddressText = async () => {
            const primaryEl = document.getElementById('dash-primary');
            if (!primaryEl) return;

            if (showDest) {
                // 도착지 정보 업데이트 (실시간 반영을 위해 AppState에서 읽기)
                const destName = AppState.destination?.name || document.getElementById('search-input').value || '도착지 정보 없음';
                primaryEl.textContent = `[도착지] ${destName}`;
                primaryEl.style.color = 'var(--text-primary)';
            } else {
                // 현위치 정보 업데이트 (주소 변환)
                if (Date.now() - lastFetchTime > 10000 || !currentAddressCache) {
                    // 10초마다 또는 캐시 없으면 주소 갱신
                    if (AppState.currentPosition) {
                        MapManager.getAddressFromCoords(AppState.currentPosition).then(addr => {
                            currentAddressCache = addr;
                            primaryEl.textContent = `[현위치] ${currentAddressCache}`;
                        });
                        lastFetchTime = Date.now();
                    }
                }

                // 렌더링 (캐시된 주소 사용, 없으면 좌표)
                if (currentAddressCache) {
                    primaryEl.textContent = `[현위치] ${currentAddressCache}`;
                } else {
                    const currLat = AppState.currentPosition?.[1].toFixed(4) || 0;
                    const currLon = AppState.currentPosition?.[0].toFixed(4) || 0;
                    primaryEl.textContent = `[현위치] (${currLat}, ${currLon})`;
                }
                primaryEl.style.color = 'var(--primary-color)';
            }
            showDest = !showDest;
        };
        updateAddressText();
        AppState.addressToggleInterval = setInterval(updateAddressText, 3000);

        if (AppState.destination && AppState.destination.coords) {
            const bestMsg = SocialManager.getBestMessageAt(AppState.destination.coords);
            if (bestMsg) {
                secondaryEl.innerHTML = `💌 <span style="font-weight:bold">${bestMsg.userId}</span>: "${bestMsg.text}" (👍${bestMsg.likes})`;
            } else {
                secondaryEl.textContent = '목적지 주변에 인기 메시지가 없습니다 😶';
            }
        }
    },

    startSlopeSimulation() {
        if (AppState.slopeInterval) clearInterval(AppState.slopeInterval);
        AppState.slopeInterval = setInterval(() => {
            const primaryEl = document.getElementById('dash-primary');
            const secondaryEl = document.getElementById('dash-secondary');
            if (!primaryEl) return;
            const slope = Math.floor(Math.random() * 12) - 2;
            // 휠체어 모드는 Primary가 경사도로 바뀜 (기존 로직 유지 시)
            // 하지만 Dashboard 로직에서 이미 Primary를 주소 토글로 쓰고 있어서 충돌 발생 가능.
            // 여기서는 Secondary 텍스트만 업데이트하거나, Primary를 덮어쓰지 않도록 주의.
            // 사용자가 "주소 토글"을 요구했으므로 경사도는 Secondary에 표시하거나 해야 함.
            // 일단 주소 토글이 우선이므로 경사도 텍스트는 보류하거나 다른 곳에 표시해야 함.
        }, 3000);
    },

    formatDistance(meters) {
        if (meters > 999) {
            return (meters / 1000).toFixed(1) + 'km';
        }
        return Math.round(meters) + 'm';
    },

    updateNavigationHUD(route) {
        if (!route) return;

        // [UPDATE] 하단 대시보드 1번째 줄로 이동 (XX분 | XXkm)
        const totalDist = this.formatDistance(route.distance);
        const totalTime = Math.ceil(route.duration / 60);

        const statsEl = document.getElementById('dash-stats');
        if (statsEl) {
            statsEl.textContent = `목적지까지 ${totalTime}분 | ${totalDist}`;
        }

        // 기존 HUD 요소 (nav-total-dist/time)는 숨겨졌으므로 업데이트 생략

        if (route.legs && route.legs[0].steps && route.legs[0].steps.length > 0) {
            const steps = route.legs[0].steps;
            const nextStep = steps[1] || steps[0];

            // [UPDATE] SVG 아이콘 렌더링 (innerHTML 사용)
            document.getElementById('nav-next-turn-icon').innerHTML = this.getTurnIcon(nextStep.maneuver.modifier);

            // [UPDATE] 다음 구간 거리 포맷팅 적용
            document.getElementById('nav-next-dist').textContent = this.formatDistance(nextStep.distance);

            // [NEW] 스마트 다이내믹 줌 트리거
            if (window.MapManager && MapManager.handleDynamicZoom) {
                MapManager.handleDynamicZoom(nextStep.distance);
            }

            const afterStep = steps[2];
            if (afterStep) {
                // [UPDATE] SVG 아이콘 렌더링
                document.getElementById('nav-second-icon').innerHTML = this.getTurnIcon(afterStep.maneuver.modifier);
                // [UPDATE] 다다음 구간 거리 포맷팅 적용
                document.getElementById('nav-second-dist').textContent = this.formatDistance(afterStep.distance);
            } else {
                document.getElementById('nav-second-icon').innerHTML = '🏁';
                document.getElementById('nav-second-dist').textContent = '0m';
            }
        }
    },

    getTurnIcon(modifier) {
        // Lucide/Feather 스타일 검증된 SVG 아이콘 (24x24 viewBox)
        const icons = {
            // 직진: 위로 향하는 화살표
            'straight': '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>',
            // 좌회전
            'left': '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>',
            // 우회전
            'right': '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>',
            // 살짝 좌회전 (대각선)
            'slight left': '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="17" y1="17" x2="7" y2="7"></line><polyline points="7 17 7 7 17 7"></polyline></svg>',
            // 살짝 우회전 (대각선)
            'slight right': '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>',
            // 급좌회전
            'sharp left': '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="11 17 6 12 11 7"></polyline><polyline points="18 17 18 12 12 12"></polyline></svg>',
            // 급우회전
            'sharp right': '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="13 17 18 12 13 7"></polyline><polyline points="6 17 6 12 12 12"></polyline></svg>',
            // 유턴
            'uturn': '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9L9 4"></path><path d="M20 20V13A4 4 0 0 0 16 9H4"></path></svg>'
        };
        return icons[modifier] || icons['straight'];
    },

    initOverlayDrag() {
        const overlay = document.getElementById('floating-overlay');
        if (!overlay) return;
        let isDragging = false, startX, startY, startLeft, startTop;

        const onDown = (clientX, clientY) => {
            isDragging = true;
            startX = clientX; startY = clientY;
            startLeft = overlay.offsetLeft; startTop = overlay.offsetTop;
            overlay.style.cursor = 'grabbing';
        };

        overlay.addEventListener('mousedown', (e) => {
            if (e.target.closest('.resize-handle') || e.target.closest('.icon-btn')) return;
            onDown(e.clientX, e.clientY);
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            overlay.style.left = `${startLeft + (e.clientX - startX)}px`;
            overlay.style.top = `${startTop + (e.clientY - startY)}px`;
        });

        document.addEventListener('mouseup', () => { isDragging = false; overlay.style.cursor = 'move'; });

        overlay.addEventListener('touchstart', (e) => {
            if (e.target.closest('.resize-handle') || e.target.closest('.icon-btn')) return;
            onDown(e.touches[0].clientX, e.touches[0].clientY);
        });

        document.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            overlay.style.left = `${startLeft + (e.touches[0].clientX - startX)}px`;
            overlay.style.top = `${startTop + (e.touches[0].clientY - startY)}px`;
        });
        document.addEventListener('touchend', () => isDragging = false);
    }
};
