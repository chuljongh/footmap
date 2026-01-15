// ========================================
// UI 관리 (UIManager)
// ========================================
const UIManager = {
    // DOM 요소 캐시
    elements: {},

    init() {
        this.cacheElements();
        this.historyTimer = null; // 검색 기록 타이머
        this.injectSVGIcons(); // 아이콘 주입
        this.initClipboardListener();
        this.bindEvents();
        this.updateProfileUI(); // 초기 프로필 UI 반영

        // [Clean-up] 구버전 테마 설정 제거 (라이트 모드 삭제로 불필요)
        Utils.removeState('appTheme');
    },

    cacheElements() {
        const ids = [
            'splash-screen', 'permission-screen', 'mode-screen', 'main-screen',
            'chat-btn', 'write-btn', 'navigate-btn', 'mode-indicator',
            'dashboard-container', 'stop-nav-btn', 'write-modal',
            'search-input', 'search-clear-btn', 'search-suggestions',
            'menu-btn', 'side-menu', 'menu-overlay', 'close-menu-btn',
            'dash-primary', 'dash-secondary', 'dash-stats',
            'nav-next-turn-icon', 'nav-next-dist', 'nav-second-icon', 'nav-second-dist', 'nav-road-name'
        ];
        ids.forEach(id => {
            this.elements[id] = document.getElementById(id);
        });
    },

    // ========================================
    // UI 아이콘 주입 (Emojis -> SVGs)
    // ========================================
    injectSVGIcons() {
        if (!window.Icons) return;

        const sets = [
            { id: 'chat-btn', icon: Icons.chat },
            { id: 'write-btn', icon: Icons.write },
            { id: 'menu-btn', icon: Icons.menu },
            { id: 'search-btn', icon: Icons.search },
            { id: 'search-clear-btn', icon: Icons.close },
            { id: 'close-menu-btn', icon: Icons.close },
            { id: 'edit-nickname-btn', icon: Icons.write },
            { id: 'edit-profile-img-btn', icon: Icons.camera },
            { id: 'close-settings-btn', icon: Icons.close },
            { id: 'close-records-btn', icon: Icons.close },
            { id: 'close-overlay-btn', icon: Icons.close },
            { id: 'close-message-btn', icon: Icons.close }
        ];

        sets.forEach(item => {
            const el = document.getElementById(item.id);
            if (el) el.innerHTML = item.icon;
        });

        // 온보딩 권한 아이콘
        const permIcons = document.querySelectorAll('.permission-icon');
        if (permIcons.length >= 3) {
            permIcons[0].innerHTML = Icons.location;
            permIcons[1].innerHTML = Icons.navigation;
            permIcons[2].innerHTML = Icons.write; // clipboard 대신 write 아이콘
        }

        // 온보딩 모드 아이콘
        const walkingIcon = document.querySelector('.mode-option[data-mode="walking"] .mode-icon');
        if (walkingIcon) walkingIcon.innerHTML = Icons.walking;
        const wheelchairIcon = document.querySelector('.mode-option[data-mode="wheelchair"] .mode-icon');
        if (wheelchairIcon) wheelchairIcon.innerHTML = Icons.wheelchair;

        // 나의 기록 아이콘
        const myRecordsBtn = document.querySelector('[data-action="my-records"] span');
        if (myRecordsBtn) myRecordsBtn.innerHTML = Icons.trophy;

        // 모드 변경 아이콘 (사이드 메뉴)
        const modeChangeIcon = document.getElementById('current-mode-icon');
        if (modeChangeIcon) modeChangeIcon.innerHTML = Icons.navigation;



        // HUD 아이콘 (초기화 시 주입)
        this.updateHUDIcons();
    },

    updateHUDIcons() {
        const nextTurnIcon = document.getElementById('nav-next-turn-icon');
        if (nextTurnIcon && !nextTurnIcon.innerHTML) {
            nextTurnIcon.innerHTML = Icons.navigation;
        }
        const secondTurnIcon = document.getElementById('nav-second-icon');
        if (secondTurnIcon && !secondTurnIcon.innerHTML) {
            secondTurnIcon.innerHTML = Icons.navigation;
        }
    },

    // 클립보드 감지 리스너 (포커스 시) - 배달원 모드 (Zero-Touch)
    initClipboardListener() {
        if (!navigator.clipboard) return;

        window.addEventListener('focus', async () => {
            try {
                const text = await navigator.clipboard.readText();
                // 1. 텍스트 유효성 및 중복 검사
                if (text && text.trim().length > 0 && text !== AppState.lastClipboardText) {
                    // URL 필터: API URL이나 웹사이트 주소는 무시
                    if (text.startsWith('http') || text.startsWith(':')) return;

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
                            }, 500);
                        }
                    }
                }
            } catch (e) {
                // 권한 거부 등 무시
            }
        });
    },

    updateProfileUI() {
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

        // 0.5초 경과 후 검색 기록 노출 (입력창이 비어있을 때)
        searchInput?.addEventListener('focus', () => {
            // [NEW] 네비게이션 종료 후 검색창 터치 시 즉시 목적지 삭제
            if (AppState.destinationClearTimer) {
                clearTimeout(AppState.destinationClearTimer);
                AppState.destinationClearTimer = null;
                MapManager.clearDestination();
            }

            if (!searchInput.value.trim()) {
                this.historyTimer = setTimeout(() => {
                    this.renderSearchHistory();
                }, 500);
            }
        });

        searchInput?.addEventListener('input', () => {
            if (this.historyTimer) {
                clearTimeout(this.historyTimer);
                this.historyTimer = null;
            }
            // 글자를 입력하기 시작하면 기록 목록은 숨김 (검색 제안이 대신 나옴)
            if (searchInput.value.trim().length > 0) {
                const list = document.getElementById('search-suggestions');
                if (list && list.classList.contains('history-mode')) {
                    list.classList.remove('visible', 'history-mode');
                }
            }
        });

        searchInput?.addEventListener('blur', () => {
            if (this.historyTimer) {
                clearTimeout(this.historyTimer);
                this.historyTimer = null;
            }
        });

        clearBtn?.addEventListener('click', () => {
            // [NEW] 네비게이션 종료 후 X버튼 터치 시 즉시 목적지 삭제
            if (AppState.destinationClearTimer) {
                clearTimeout(AppState.destinationClearTimer);
                AppState.destinationClearTimer = null;
                MapManager.clearDestination();
            }

            if (searchInput) {
                searchInput.value = '';
                searchInput.focus();
                // hidden 클래스 토글 불필요 - CSS가 :placeholder-shown으로 처리
            }
        });

        // 네비게이션
        document.getElementById('navigate-btn')?.addEventListener('click', () => this.handleNavigate());
        document.getElementById('stop-nav-btn')?.addEventListener('click', (e) => { e.stopPropagation(); this.handleNavigate(true); });
        document.getElementById('report-btn')?.addEventListener('click', (e) => { e.stopPropagation(); Utils.showToast('🚨 신고되었습니다!'); });

        // 오버레이 설정
        document.getElementById('opacity-slider')?.addEventListener('input', (e) => {
            const val = e.target.value;
            AppState.overlayOpacity = parseInt(val);
            const opacityEl = document.getElementById('opacity-value');
            if (opacityEl) opacityEl.textContent = val;
            Utils.updateCSSVar('--overlay-opacity', (100 - val) / 100);
            Utils.saveState('overlayOpacity', val);
        });
        document.getElementById('close-settings-btn')?.addEventListener('click', () => document.getElementById('overlay-settings-modal')?.classList.add('hidden'));
        document.getElementById('close-overlay-btn')?.addEventListener('click', () => document.getElementById('floating-overlay')?.classList.add('hidden'));

        // [FIX] 나의 기록(저장된 대화) 모달 닫기 버튼
        document.getElementById('close-records-btn')?.addEventListener('click', () => document.getElementById('my-records-modal')?.classList.add('hidden'));
        document.getElementById('my-records-modal')?.addEventListener('click', (e) => {
            if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
        });

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
                    document.getElementById('profile-img')?.setAttribute('src', imgData);
                    Utils.saveState('userProfileImg', imgData);
                    AppState.userProfile.profileImg = imgData;
                };
                reader.readAsDataURL(e.target.files[0]);
            }
        });

        // 모드 캡슐 스위치 이벤트
        document.getElementById('mode-capsule-switch')?.addEventListener('click', (e) => {
            const btn = e.target.closest('.capsule-option');
            if (!btn) return;

            const newMode = btn.dataset.mode;
            if (newMode === AppState.userMode) return; // 같은 모드면 무시

            // 상태 업데이트
            AppState.userMode = newMode;
            Utils.saveState('userMode', newMode);

            // UI 업데이트 (active 클래스 교체)
            document.querySelectorAll('.capsule-option').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // 지도 데이터 리로드
            this.updateModeIndicator();
            AppState.trajectoryLayer?.getSource().clear();
            PathManager.loadDummyTrajectories();

            // 토스트 메시지
            const modeName = newMode === 'walking' ? '도보' : '휠체어';
            Utils.showToast(`${modeName} 모드로 변경했습니다.`);
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
                if (!response.ok) throw new Error('Search failed');
                const data = await response.json();
                list.innerHTML = '';
                if (data.documents && data.documents.length > 0) {
                    // 현재 위치 가져오기
                    const userPos = AppState.currentPosition;

                    // 거리 포맷 함수
                    const formatDistance = (meters) => {
                        if (meters === null) return '';
                        if (meters < 1000) return `${Math.round(meters)}m`;
                        return `${(meters / 1000).toFixed(1)}km`;
                    };

                    data.documents.forEach(doc => {
                        const item = document.createElement('li');
                        item.className = 'suggestion-item';
                        // [Refactored] Utils.calculateDistance 사용 (중복 제거)
                        const dist = userPos
                            ? Utils.calculateDistance(userPos, [parseFloat(doc.x), parseFloat(doc.y)])
                            : null;
                        const distText = formatDistance(dist);

                        item.innerHTML = `
                            <div class="suggestion-main">
                                <div class="suggestion-name">${doc.place_name}</div>
                                <div class="suggestion-address">${doc.road_address_name || doc.address_name}</div>
                            </div>
                            ${distText ? `<div class="suggestion-meta">${distText}</div>` : ''}
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
            const list = document.getElementById('search-suggestions');
            if (!input.contains(e.target) && !list.contains(e.target)) {
                list.classList.remove('visible', 'history-mode');
            }
        });
    },

    // ========================================
    // 검색 기록 (History) 관리
    // ========================================
    saveSearchHistory(query) {
        if (!query || query.trim().length < 2) return;
        const q = query.trim();

        let history = Utils.loadState('search_history', []);

        // 기존 문자열 형식 호환 + 객체 형식으로 변환
        history = history.map(item =>
            typeof item === 'string' ? { query: item, timestamp: Date.now() } : item
        );

        // 중복 제거 후 최상단 추가
        history = history.filter(item => item.query !== q);
        history.unshift({ query: q, timestamp: Date.now() });

        // 최대 20개 유지
        if (history.length > 20) history = history.slice(0, 20);

        Utils.saveState('search_history', history);
    },

    getSearchHistory() {
        const history = Utils.loadState('search_history', []);
        // 기존 문자열 형식 호환
        return history.map(item =>
            typeof item === 'string' ? { query: item, timestamp: Date.now() } : item
        );
    },

    renderSearchHistory() {
        const input = document.getElementById('search-input');
        const list = document.getElementById('search-suggestions');
        if (!list || !input) return;

        const history = this.getSearchHistory();
        if (history.length === 0) return;

        list.innerHTML = '';
        list.classList.add('history-mode');

        // 날짜 포맷 함수 (M/D)
        const formatDate = (timestamp) => {
            const d = new Date(timestamp);
            return `${d.getMonth() + 1}/${d.getDate()}`;
        };

        history.forEach(item => {
            const li = document.createElement('li');
            li.className = 'suggestion-item';
            li.innerHTML = `
                <div class="suggestion-main">
                    <div class="suggestion-name">${item.query}</div>
                </div>
                <div class="suggestion-meta">${formatDate(item.timestamp)}</div>
            `;
            li.addEventListener('click', () => {
                input.value = item.query;
                list.classList.remove('visible', 'history-mode');
                this.handleSearch();
            });
            list.appendChild(li);
        });

        list.classList.add('visible');
        list.scrollTop = 0;
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
        document.getElementById('waypoint-modal')?.classList.remove('hidden');
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

                // 경유지 주소 가져와서 검색 기록에 저장
                MapManager.getAddressFromCoords(coords).then(addressName => {
                    this.saveSearchHistory(addressName);
                });

                RouteManager.showRoute(AppState.currentPosition, AppState.destination.coords, AppState.waypoints);
                AppState.pendingWaypoint = null;
            } else if (action === 'new-dest') {
                // [FIX] 새 목적지 설정 전 기존 클린업 타이머 취소 (레이스 컨디션 방지)
                if (AppState.destinationClearTimer) {
                    clearTimeout(AppState.destinationClearTimer);
                    AppState.destinationClearTimer = null;
                }
                this.handleNavigate(true);
                setTimeout(() => {
                    MapManager.setDestinationByClick(AppState.pendingWaypoint);
                    AppState.pendingWaypoint = null;
                }, 300);
            } else if (action === 'final-dest') {
                if (!AppState.destination) {
                    Utils.showToast('기존 목적지가 없습니다. 새 목적지로 설정합니다.');
                    this.handleWaypointAction('new-dest');
                    return;
                }
                const oldDestCoords = AppState.destination.coords;
                const newDestCoords = AppState.pendingWaypoint; // Capture local copy

                AppState.waypoints.push(oldDestCoords);
                MapManager.addWaypointMarker(oldDestCoords);

                // 새로운 최종 목적지 주소 가져오기
                MapManager.getAddressFromCoords(newDestCoords).then(addressName => {
                    MapManager.setDestination(newDestCoords, addressName);
                    document.getElementById('search-input')?.setAttribute('value', addressName); // 검색창 업데이트

                    RouteManager.showRoute(AppState.currentPosition, AppState.destination.coords, AppState.waypoints);
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
            const opacityValEl = document.getElementById('opacity-value');
            if (opacityValEl) opacityValEl.textContent = AppState.overlayOpacity;
            Utils.updateCSSVar('--overlay-opacity', (100 - AppState.overlayOpacity) / 100);
        }

        // 캡슐 스위치 상태 동기화
        document.querySelectorAll('.capsule-option').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === AppState.userMode);
        });

        return onboardingComplete;
    },

    updateModeIndicator() {
        const indicator = this.elements['mode-indicator'];
        const menuIcon = document.getElementById('current-mode-icon'); // Not in basic cache, fetch if needed or add to cache

        let icon = Icons.walking;
        if (AppState.userMode === 'wheelchair') icon = Icons.wheelchair;

        if (indicator) indicator.innerHTML = icon;
        if (menuIcon) menuIcon.innerHTML = icon;
    },

    openMenu() {
        // [FIX] 대화 모드가 열려있다면 닫기
        if (typeof SocialManager !== 'undefined' && SocialManager.isTalkMode) {
            SocialManager.closeTalkMode();
        }

        this.elements['side-menu']?.classList.add('open');
        this.elements['menu-overlay']?.classList.add('visible');
    },

    closeMenu() {
        this.elements['side-menu']?.classList.remove('open');
        this.elements['menu-overlay']?.classList.remove('visible');
    },

    handleMenuAction(action) {


        this.closeMenu();
        switch (action) {
            case 'my-records': this.showMyRecords(); break;
            case 'saved-messages': this.showSavedMessages(); break;
            case 'overlay-settings':
                document.getElementById('overlay-settings-modal')?.classList.remove('hidden');
                break;
            case 'toggle-theme':
                this.toggleTheme();
                break;
        }
    },



    async showMyRecords() {
        const modal = document.getElementById('my-records-modal');
        modal.classList.remove('hidden');

        // 사용자 통계 업데이트
        const userId = AppState.userProfile?.nickname || '익명';
        try {
            const res = await fetch(`/api/users/${encodeURIComponent(userId)}`);
            if (res.ok) {
                const userData = await res.json();
                document.getElementById('stat-walking').textContent = `${(userData.distWalking || 0).toFixed(1)}km`;
                document.getElementById('stat-wheelchair').textContent = `${(userData.distWheelchair || 0).toFixed(1)}km`;
            }
        } catch (e) {
            console.error('Failed to load user stats:', e);
        }

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
                    if (!routesRes.ok) throw new Error('Failed to load routes');
                    items = await routesRes.json();
                    renderFn = this.renderRouteItem;
                    break;
                case 'messages':
                    const msgsRes = await fetch(`/api/users/${encodeURIComponent(userId)}/messages`);
                    if (!msgsRes.ok) throw new Error('Failed to load messages');
                    items = await msgsRes.json();
                    renderFn = this.renderMessageItem;
                    break;
                case 'comments':
                    const cmtsRes = await fetch(`/api/users/${encodeURIComponent(userId)}/comments`);
                    if (!cmtsRes.ok) throw new Error('Failed to load comments');
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

    // [OPTIMIZED] 공통 레코드 아이템 HTML 생성
    createRecordItemHTML(icon, title, meta) {
        return `<div class="record-item"><span class="icon">${icon}</span><div class="info"><div class="title">${title}</div><div class="meta">${meta}</div></div></div>`;
    },

    renderRouteItem(r) {
        const date = new Date(r.timestamp).toLocaleDateString('ko-KR');
        const dist = r.distance ? r.distance.toFixed(1) + 'km' : '?km';
        const mode = r.mode === 'wheelchair' ? '♿ 휠체어' : '🚶 도보';
        return this.createRecordItemHTML('📍', `${dist} · ${mode}`, date);
    },

    renderMessageItem(m) {
        const date = new Date(m.timestamp).toLocaleDateString('ko-KR');
        return this.createRecordItemHTML('💬', m.text, `${date} · 👍 ${m.likes}`);
    },

    renderCommentItem(c) {
        const date = new Date(c.timestamp).toLocaleDateString('ko-KR');
        return this.createRecordItemHTML('✏️', c.text, date);
    },

    showSavedMessages() {
        const modal = document.getElementById('my-records-modal');
        modal.classList.remove('hidden');

        // 모달 제목 변경
        const titleEl = modal.querySelector('h3');
        if (titleEl) titleEl.textContent = '💾 저장된 대화';

        // 탭 숨기기
        const tabsEl = modal.querySelector('.records-tabs');
        if (tabsEl) tabsEl.classList.add('hidden');

        // 목록 로드
        this.loadSavedMessagesList();
    },

    async loadSavedMessagesList() {
        const userId = AppState.userProfile?.nickname || '익명';
        const listEl = document.getElementById('records-list');
        listEl.innerHTML = '<p class="empty-state">불러오는 중...</p>';

        try {
            const res = await fetch(`/api/users/${encodeURIComponent(userId)}/saved`);
            const messages = await res.json();

            if (messages.length === 0) {
                listEl.innerHTML = '<p class="empty-state">저장된 대화가 없습니다.</p>';
                return;
            }

            listEl.innerHTML = messages.map(m => `
                <div class="record-item saved-msg-item" data-msg-id="${m.id}">
                    <span class="icon">💬</span>
                    <div class="info">
                        <div class="title">${m.text}</div>
                        <div class="meta">${new Date(m.timestamp).toLocaleDateString('ko-KR')} · 👍 ${m.likes || 0}</div>
                    </div>
                </div>
            `).join('');

            // 클릭 이벤트
            listEl.querySelectorAll('.saved-msg-item').forEach(item => {
                item.addEventListener('click', () => {
                    const msgId = item.dataset.msgId;
                    SocialManager.openThreadPanel(msgId);
                    document.getElementById('my-records-modal')?.classList.add('hidden');
                });
            });
        } catch (e) {
            console.error('Saved messages load error:', e);
            listEl.innerHTML = '<p class="empty-state">오류가 발생했습니다.</p>';
        }
    },

    async handleSearch() {
        const input = this.elements['search-input'];
        const query = input?.value.trim();
        if (!query) { Utils.showToast('주소를 입력해주세요.'); return false; }
        try {
            const response = await fetch(`/api/search?query=${encodeURIComponent(query)}`);
            if (!response.ok) throw new Error('Network response was not ok');
            const data = await response.json();
            if (data.documents && data.documents.length > 0) {
                const doc = data.documents[0];
                const coords = [parseFloat(doc.x), parseFloat(doc.y)];
                MapManager.setDestination(coords, query);
                const overlayDest = document.getElementById('overlay-destination'); // Not in basic cache
                if (overlayDest) overlayDest.textContent = query;
                return true; // Search success
            } else {
                Utils.showToast('검색 결과가 없습니다.');
                return false;
            }
        } catch (e) {
            console.error(e);
            Utils.showToast('검색 에러: ' + e.message);
            return false;
        }
    },

    enableNavigateButton() {
        const btn = this.elements['navigate-btn'];
        if (btn) {
            btn.classList.remove('disabled');
            btn.querySelector('.btn-text').textContent = '경로 안내 시작';
        }
    },

    handleNavigate(forceStop = false) {
        const btn = document.getElementById('navigate-btn');
        // [FIX] forceStop일 때는 버튼이 disabled여도 진행 (안내 종료 강제 실행)
        if (!forceStop && btn && btn.classList.contains('disabled')) return;

        if (forceStop || AppState.isNavigating) {
            // [STOP NAVIGATION]

            // [NEW] 경유지가 남아있으면 선택 다이얼로그 표시
            if (AppState.waypoints && AppState.waypoints.length > 0) {
                this.showNavigationEndDialog();
                return;
            }

            this.executeNavigationStop(btn);
            return;
        }

        // [START NAVIGATION]
        this.handleNavigateStart();
    },

    // [NEW] 경유지 있을 때 안내 종료 다이얼로그
    showNavigationEndDialog() {
        const dialog = document.createElement('div');
        dialog.className = 'modal-overlay nav-end-dialog';
        dialog.innerHTML = `
            <div class="modal-content" style="max-width: 320px; padding: 24px; text-align: center;">
                <h3 style="margin-bottom: 16px; font-size: 18px;">📍 안내 종료</h3>
                <p style="margin-bottom: 20px; color: var(--text-secondary); font-size: 14px;">
                    아직 남은 목적지가 있습니다.<br>다음 장소로 이동할까요?
                </p>
                <div style="display: flex; gap: 12px;">
                    <button id="nav-end-all" class="secondary-btn" style="flex: 1; padding: 12px;">
                        전체 종료
                    </button>
                    <button id="nav-continue" class="primary-btn" style="flex: 1; padding: 12px;">
                        이어서 안내
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(dialog);

        document.getElementById('nav-end-all').addEventListener('click', () => {
            dialog.remove();
            this.executeNavigationStop(document.getElementById('navigate-btn'));
        });

        document.getElementById('nav-continue').addEventListener('click', () => {
            dialog.remove();
            this.continueToNextWaypoint();
        });
    },

    // [NEW] 다음 경유지로 이어서 안내
    async continueToNextWaypoint() {
        // [NEW] 재탐색 타이머 정리
        this.clearRerouteTimer();

        // 접근로 데이터 저장 (현재 구간)
        this.saveAccessDataForCurrentSegment();

        // 현재 목적지를 도착 완료 처리하고 다음으로 이동
        const reachedDestination = AppState.destination;

        if (AppState.waypoints && AppState.waypoints.length > 0) {
            // [FIX] 기존 마커 삭제 (경유지 배열은 유지)
            MapManager.clearWaypointMarkersOnly();

            // [FIX] 방문 완료된 경유지만 제거 (destination은 건드리지 않음!)
            AppState.waypoints.shift();

            // 현재 위치에서 새 목적지로 경로 재탐색
            AppState.currentStepIndex = 0;
            AppState.isInAccessZone = false;
            AppState.accessHistory = [];

            // [FIX] 경로 계산 완료까지 대기 (async/await)
            await RouteManager.showRoute(
                AppState.currentPosition,
                AppState.destination.coords,  // 최종 목적지 유지!
                AppState.waypoints            // 남은 경유지들
            );

            // 경로 계산 완료 후 마커/뷰 갱신
            MapManager.refreshMarkers();
            MapManager.fitViewToRoute();

            // [FIX] 검색창에 현재 목적지 이름 표시
            const searchInput = document.getElementById('search-input');
            if (searchInput) searchInput.value = AppState.destination.name || '다음 목적지';

            Utils.showToast('✅ 다음 목적지로 안내를 시작합니다');

        } else {
            // 더 이상 경유지가 없으면 종료
            this.executeNavigationStop(document.getElementById('navigate-btn'));
        }
    },

    // [NEW] 현재 구간 데이터 처리 및 저장 (공통 로직)
    processAndSaveRoute() {
        try {
            // 전체 경로 통합 (일반 구간 + 접근 구간)
            let fullHistory = [...(AppState.routeHistory || []), ...(AppState.accessHistory || [])];

            if (fullHistory.length > 1 && AppState.destination) {
                const validPoints = [];
                let totalDistance = 0;

                for (let i = 0; i < fullHistory.length; i++) {
                    const current = fullHistory[i];
                    if (i === 0) {
                        validPoints.push(current);
                        continue;
                    }

                    const prev = fullHistory[i - 1];
                    const dist = Utils.calculateDistance(prev.coords, current.coords);
                    const timeDiff = (current.timestamp - prev.timestamp) / 1000;

                    const speedKmh = timeDiff > 0 ? (dist / timeDiff) * 3.6 : 0;

                    if (speedKmh <= Config.MAX_COLLECTION_SPEED) {
                        validPoints.push(current);
                        totalDistance += dist;
                    }
                }

                if (validPoints.length >= 5 && totalDistance >= 50) {
                    DataCollector.saveRoute({
                        distance: totalDistance / 1000,
                        duration: (validPoints[validPoints.length - 1].timestamp - validPoints[0].timestamp) / 1000,
                        mode: AppState.userMode || 'walking',
                        startCoords: validPoints[0].coords.join(','),
                        endCoords: validPoints[validPoints.length - 1].coords.join(','),
                        destinationCoords: AppState.destination.coords.join(','),
                        points: validPoints
                    }).catch(e => console.error('Route save err:', e));
                }
            }
        } catch (err) {
            console.error('Save setup err:', err);
        }
    },

    // [NEW] 현재 구간 접근로 데이터 저장
    saveAccessDataForCurrentSegment() {
        this.processAndSaveRoute();
    },

    // [NEW] 재탐색 타이머 정리 헬퍼
    clearRerouteTimer() {
        if (AppState.rerouteTimer) {
            clearTimeout(AppState.rerouteTimer);
            AppState.rerouteTimer = null;
        }
    },

    // 경로 진도 동기화 + 이탈 감지 (Step Snapping 포함)
    checkRouteDeviation(currentCoords, heading = null) {
        if (!AppState.isNavigating || !AppState.activeRoute) return;

        const legs = AppState.activeRoute.legs;
        if (!legs || legs.length === 0 || !legs[0].steps) return;

        const steps = legs[0].steps;
        const currentStepIndex = AppState.currentStepIndex || 0;

        // 1. Step Snapping: 사용자가 실제로 어느 Step 위에 있는지 확인
        const realStepIndex = Utils.findClosestStepIndex(
            currentCoords,
            heading,
            steps,
            currentStepIndex,
            Config.REROUTE_THRESHOLD_METERS
        );

        // 2. 스텝 점프 (앞으로 건너뛰기)
        if (realStepIndex > currentStepIndex) {
            AppState.currentStepIndex = realStepIndex;
            AppState.isZoomedIn = false;
            this.clearRerouteTimer();
            return;  // 점프했으면 이탈 체크 불필요
        }

        // 3. 스텝 되감기 (뒤로 돌아감)
        if (realStepIndex !== -1 && realStepIndex < currentStepIndex) {
            AppState.currentStepIndex = realStepIndex;
            AppState.isZoomedIn = false;
            this.clearRerouteTimer();
            return;
        }

        // 4. 경로 이탈 감지 (어느 Step에도 없으면)
        if (realStepIndex === -1) {
            if (Date.now() - AppState.lastRerouteTime < Config.MIN_REROUTE_INTERVAL_MS) return;

            if (!AppState.rerouteTimer) {
                AppState.rerouteTimer = setTimeout(() => {
                    this.performReroute();
                }, Config.REROUTE_DEBOUNCE_MS);
            }
        } else {
            this.clearRerouteTimer();
        }
    },

    // 경로 재탐색 실행
    performReroute() {
        AppState.rerouteTimer = null;
        AppState.lastRerouteTime = Date.now();

        if (!AppState.currentPosition || !AppState.destination) return;

        Utils.showToast('🔄 경로를 재탐색합니다...');

        RouteManager.showRoute(
            AppState.currentPosition,
            AppState.destination.coords,
            AppState.waypoints || []
        );
    },

    // [REFACTORED] 실제 안내 종료 실행
    executeNavigationStop(btn) {
        // 1. UI & State Cleanup (Priority)
        AppState.isNavigating = false;
        AppState.isUserInteracting = false;

        // [NEW] Wake Lock 해제
        this.releaseWakeLock();

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
        this.processAndSaveRoute();

        // [NEW] 재탐색 타이머 정리
        this.clearRerouteTimer();

        // [NEW] 상태 초기화
        AppState.isInAccessZone = false;
        AppState.accessHistory = [];
        AppState.routeHistory = []; // [NEW] 전체 경로 초기화 추가
        AppState.activeRoute = null;
        MapManager.clearWaypoints();

        // Destination Clear Timer
        if (AppState.destinationClearTimer) clearTimeout(AppState.destinationClearTimer);
        AppState.destinationClearTimer = setTimeout(() => {
            MapManager.clearDestination();
            AppState.destinationClearTimer = null;
        }, 5000);
    },

    handleNavigateStart() {
        // 타이머 취소
        if (AppState.destinationClearTimer) {
            clearTimeout(AppState.destinationClearTimer);
            AppState.destinationClearTimer = null;
        }

        AppState.isNavigating = true;
        AppState.isUserInteracting = false;
        AppState.routeHistory = [];
        AppState.currentStepIndex = 0;
        AppState.lastRerouteTime = 0;
        this.clearRerouteTimer();

        // Wake Lock - 화면 꺼짐 방지
        this.requestWakeLock();

        document.body.classList.add('search-hidden');
        document.getElementById('navigation-hud')?.classList.remove('hidden');
        document.getElementById('dashboard-container')?.classList.remove('hidden');
        document.getElementById('pre-nav-actions')?.classList.add('hidden');

        // 대화 오버레이 강제 종료
        if (typeof SocialManager !== 'undefined' && SocialManager.closeTalkMode) {
            SocialManager.closeTalkMode();
        }

        this.updateDashboard(AppState.userMode);

        RouteManager.showRoute(AppState.currentPosition, AppState.destination.coords, AppState.waypoints);
        MapManager.fitViewToRoute();

        if (AppState.activeRoute) this.updateNavigationHUD(AppState.activeRoute);
    },

    updateDashboard(mode) {
        const primaryEl = this.elements['dash-primary'];
        const secondaryEl = document.getElementById('dash-secondary');
        if (AppState.addressToggleInterval) { clearInterval(AppState.addressToggleInterval); AppState.addressToggleInterval = null; }

        let showDest = true;
        let currentAddressCache = null;
        let lastFetchTime = 0;

        const updateAddressText = async () => {
            if (!primaryEl) return;

            if (showDest) {
                const destName = AppState.destination?.name || this.elements['search-input']?.value || '도착지 정보 없음';
                primaryEl.textContent = `[도착지] ${destName}`;
                primaryEl.classList.remove('text-accent');
                primaryEl.classList.add('text-default');
            } else {
                if (Date.now() - lastFetchTime > 10000 || !currentAddressCache) {
                    if (AppState.currentPosition) {
                        MapManager.getAddressFromCoords(AppState.currentPosition).then(addr => {
                            currentAddressCache = addr;
                            primaryEl.textContent = `[현위치] ${currentAddressCache}`;
                        });
                        lastFetchTime = Date.now();
                    }
                }

                if (currentAddressCache) {
                    primaryEl.textContent = `[현위치] ${currentAddressCache}`;
                } else {
                    const currLat = AppState.currentPosition?.[1].toFixed(4) || 0;
                    const currLon = AppState.currentPosition?.[0].toFixed(4) || 0;
                    primaryEl.textContent = `[현위치] (${currLat}, ${currLon})`;
                }
                primaryEl.classList.remove('text-default');
                primaryEl.classList.add('text-accent');
            }
            showDest = !showDest;
        };
        updateAddressText();
        AppState.addressToggleInterval = setInterval(updateAddressText, 3000);

        // 목적지 주변 인기 대화 캐러셀 (상위 3개, 1.5초 간격)
        if (AppState.messageCarouselInterval) { clearInterval(AppState.messageCarouselInterval); AppState.messageCarouselInterval = null; }

        if (AppState.destination && AppState.destination.coords) {
            const topMessages = SocialManager.getTopMessagesAt(AppState.destination.coords, 3);

            if (topMessages.length > 0) {
                let msgIndex = 0;
                const showNextMessage = () => {
                    const msg = topMessages[msgIndex];
                    secondaryEl.innerHTML = `💬 "${msg.text}" (👍${msg.likes})`;
                    msgIndex = (msgIndex + 1) % topMessages.length;
                };
                showNextMessage(); // 즉시 첫 번째 메시지 표시
                if (topMessages.length > 1) {
                    AppState.messageCarouselInterval = setInterval(showNextMessage, 3000);
                }
            } else {
                secondaryEl.textContent = '목적지 주변에 인기 메시지가 없습니다 😶';
            }
        }
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

        const statsEl = this.elements['dash-stats'];
        if (statsEl) {
            statsEl.textContent = `목적지까지 ${totalTime}분 | ${totalDist}`;
        }

        if (route.legs && route.legs[0].steps && route.legs[0].steps.length > 0) {
            const steps = route.legs[0].steps;
            const currentPos = AppState.currentPosition;


            // [FIX] 현재 위치 기반으로 다음 턴까지 거리 계산
            let stepIndex = AppState.currentStepIndex || 0;

            // 현재 스텝의 목표 지점(다음 턴 위치)
            let nextStep = steps[stepIndex + 1] || steps[stepIndex];
            if (!nextStep) return;

            const turnLocation = nextStep.maneuver.location; // [lon, lat]
            const distanceToTurn = Utils.calculateDistance(currentPos, turnLocation);

            // [300m 규칙] 목적지까지 거리 미리 계산 (모든 줌 로직에서 공유)
            const distToDest = (AppState.destination)
                ? Utils.calculateDistance(currentPos, AppState.destination.coords)
                : Infinity;


            // 턴 지점을 50m 이내로 지나쳤으면 다음 스텝으로 이동 (GPS 오차 고려)
            if (distanceToTurn < 50 && stepIndex < steps.length - 1) {
                AppState.currentStepIndex = stepIndex + 1;
                stepIndex = AppState.currentStepIndex;
                nextStep = steps[stepIndex + 1] || steps[stepIndex];

                // [FIX] 회전 완료 후 전체 뷰로 복귀
                AppState.isZoomedIn = false;

                // [단순화] 턴 완료 후 항상 Destination Fit
                MapManager.fitViewToDestination();
            }

            // [UPDATE] SVG 아이콘 렌더링 (innerHTML 사용)
            const navNextIcon = this.elements['nav-next-turn-icon'];
            if (navNextIcon) navNextIcon.innerHTML = this.getTurnIcon(nextStep.maneuver.modifier);

            const navNextDist = this.elements['nav-next-dist'];
            if (navNextDist) navNextDist.textContent = this.formatDistance(distanceToTurn);

            // [NEW] 도로명 업데이트
            const navRoadName = this.elements['nav-road-name'];
            if (navRoadName) navRoadName.textContent = nextStep.name || '';

            // [단순화] 기본: 항상 현위치+목적지 화면 포함
            if (typeof MapManager !== 'undefined' && MapManager.fitViewToDestination) {
                MapManager.fitViewToDestination();
            }

            // [조건부] 목적지 멀고(>300m) + 턴 가까우면(≤300m): 턴 확대 오버라이드
            if (distToDest > 300 && distanceToTurn <= 300 && turnLocation) {
                if (typeof MapManager !== 'undefined' && MapManager.handleDynamicZoom) {
                    MapManager.handleDynamicZoom(distanceToTurn, turnLocation);
                }
            }

            const afterStep = steps[stepIndex + 2];
            const navSecondIcon = this.elements['nav-second-icon'];
            const navSecondDist = this.elements['nav-second-dist'];
            if (afterStep) {
                // [UPDATE] SVG 아이콘 렌더링
                if (navSecondIcon) navSecondIcon.innerHTML = this.getTurnIcon(afterStep.maneuver.modifier);
                // 다다음 구간 거리
                if (navSecondDist) navSecondDist.textContent = this.formatDistance(afterStep.distance);
            } else {
                if (navSecondIcon) navSecondIcon.innerHTML = Icons.navigation;
                if (navSecondDist) navSecondDist.textContent = '🏁';
            }
        }
    },

    getTurnIcon(modifier) {
        // 단일 스트로크(One-stroke)로 연결된 SVG 아이콘 (24x24 viewBox)
        // 펜을 떼지 않고 그리는 방식으로 '벌어짐' 현상을 원천 차단
        const icons = {
            // 직진: 꼬리 -> 머리 -> 왼쪽 날개 -> 머리 -> 오른쪽 날개
            'straight': '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19 L12 5 L7 10 L12 5 L17 10"/></svg>',
            // 좌회전: 꼬리 -> 머리 -> 아래 날개 -> 머리 -> 위 날개
            'left': '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12 L5 12 L12 19 L5 12 L12 5"/></svg>',
            // 우회전: 꼬리 -> 머리 -> 위 날개 -> 머리 -> 아래 날개
            'right': '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12 L19 12 L12 5 L19 12 L12 19"/></svg>',
            // 살짝 좌회전 (대각선)
            'slight left': '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M17 17 L7 7 L7 15 L7 7 L15 7"/></svg>',
            // 살짝 우회전 (대각선)
            'slight right': '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 L17 7 L9 7 L17 7 L17 15"/></svg>',
            // 급좌회전: ㄴ 자 꼬리 -> 머리 -> 아래 날개 -> 머리 -> 위 날개
            'sharp left': '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 17 V12 H6 L11 17 L6 12 L11 7"/></svg>',
            // 급우회전: 역 ㄴ 자 꼬리 -> 머리 -> 위 날개 -> 머리 -> 아래 날개
            'sharp right': '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 17 V12 H18 L13 17 L18 12 L13 7"/></svg>',
            // 유턴: 꼬리 -> 머리(곡선) -> 날개1 -> 머리 -> 날개2
            'uturn': '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20 V13 A4 4 0 0 0 12 9 H4 L9 14 L4 9 L9 4"/></svg>'
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
            overlay.classList.add('cursor-grabbing');
            overlay.classList.remove('cursor-move');
        };

        overlay.addEventListener('mousedown', (e) => {
            if (e.target.closest('.resize-handle') || e.target.closest('.icon-btn')) return;
            onDown(e.clientX, e.clientY);
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            overlay.style.setProperty('--drag-x', `${startLeft + (e.clientX - startX)}px`);
            overlay.style.setProperty('--drag-y', `${startTop + (e.clientY - startY)}px`);
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
            overlay.classList.remove('cursor-grabbing');
            overlay.classList.add('cursor-move');
        });

        overlay.addEventListener('touchstart', (e) => {
            if (e.target.closest('.resize-handle') || e.target.closest('.icon-btn')) return;
            onDown(e.touches[0].clientX, e.touches[0].clientY);
        });

        document.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            overlay.style.setProperty('--drag-x', `${startLeft + (e.touches[0].clientX - startX)}px`);
            overlay.style.setProperty('--drag-y', `${startTop + (e.touches[0].clientY - startY)}px`);
        });
        document.addEventListener('touchend', () => isDragging = false);
    },

    // [NEW] Wake Lock API - 화면 꺼짐 방지
    async requestWakeLock() {
        if ('wakeLock' in navigator) {
            try {
                AppState.wakeLock = await navigator.wakeLock.request('screen');


                // 화면이 다시 보이면 Wake Lock 재요청
                document.addEventListener('visibilitychange', async () => {
                    if (document.visibilityState === 'visible' && AppState.isNavigating) {
                        AppState.wakeLock = await navigator.wakeLock.request('screen');
                    }
                });
            } catch (err) {
                console.warn('Wake Lock 요청 실패:', err);
            }
        } else {
            console.warn('이 브라우저는 Wake Lock API를 지원하지 않습니다.');
        }
    },

    releaseWakeLock() {
        if (AppState.wakeLock) {
            AppState.wakeLock.release();
            AppState.wakeLock = null;

        }
    }
};

// Explicit Global Export
window.UIManager = UIManager;
