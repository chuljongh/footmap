// ========================================
// 대시보드 관리자 (Dashboard Manager)
// ========================================
const DashboardManager = {
    isOpen: false,
    currentTab: 'movement',
    data: null,

    LEVEL_THRESHOLDS: [
        { level: 1, points: 0, title: '🌱 동네 새싹' },
        { level: 2, points: 100, title: '🚶 동네 산책가' },
        { level: 3, points: 300, title: '🏃 활동 주민' },
        { level: 4, points: 700, title: '🏙️ 도시 탐험가' },
        { level: 5, points: 1500, title: '🌏 지역 영웅' },
        { level: 6, points: 3000, title: '🚀 발길의 전설' }
    ],

    async init() {
        this.bindEvents();
    },

    bindEvents() {
        // 설정 메뉴에서 대시보드 열기 버튼
        document.getElementById('open-dashboard-btn')?.addEventListener('click', () => {
            this.open();
        });

        // 모달 닫기
        document.getElementById('dashboard-modal')?.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay')) {
                this.close();
            }
        });

        document.getElementById('close-dashboard-btn')?.addEventListener('click', () => {
            this.close();
        });

        // 탭 전환
        document.querySelectorAll('.dash-tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = e.currentTarget.dataset.tab;
                this.switchTab(tab);
            });
        });
    },

    async open() {
        const modal = document.getElementById('dashboard-modal');
        if (!modal) return;

        modal.classList.remove('hidden');
        this.isOpen = true;

        // 로딩 표시
        this.showLoading();

        try {
            const userId = Utils.loadState('userId') || 'anonymous';
            const response = await fetch(`/api/user/${userId}/dashboard`);

            if (!response.ok) throw new Error('Failed to fetch dashboard data');

            this.data = await response.json();
            this.render();
        } catch (err) {
            console.error('Dashboard load error:', err);
            Utils.showToast('대시보드를 불러오는데 실패했습니다');
        }
    },

    close() {
        const modal = document.getElementById('dashboard-modal');
        if (modal) modal.classList.add('hidden');
        this.isOpen = false;
    },

    showLoading() {
        const content = document.getElementById('dash-content-area');
        if (content) {
            content.innerHTML = `
                <div class="dash-loading">
                    <div class="loading-spinner"></div>
                    <p>데이터를 불러오는 중...</p>
                </div>
            `;
        }
    },

    render() {
        if (!this.data) return;

        this.renderHeader();
        this.switchTab(this.currentTab);
    },

    renderHeader() {
        const { profile } = this.data;
        const header = document.getElementById('dash-header');
        if (!header) return;

        const progressPercent = Math.min(profile.progress * 100, 100);
        const nextLevelText = profile.nextLevelPoints
            ? `다음 레벨까지 ${profile.nextLevelPoints - profile.currentPoints}점`
            : '최고 레벨 달성! 🎉';

        header.innerHTML = `
            <div class="dash-profile">
                <div class="level-badge level-${profile.level}">Lv.${profile.level}</div>
                <div class="profile-info">
                    <h2 class="profile-title">${profile.title}</h2>
                    <div class="xp-bar-container">
                        <div class="xp-bar" style="width: ${progressPercent}%"></div>
                    </div>
                    <div class="xp-text">
                        <span class="current-points">${profile.currentPoints.toLocaleString()}점</span>
                        <span class="next-level">${nextLevelText}</span>
                    </div>
                </div>
            </div>
        `;
    },

    switchTab(tabName) {
        this.currentTab = tabName;

        // 탭 버튼 활성화 상태 변경
        document.querySelectorAll('.dash-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        // 탭 컨텐츠 렌더링
        if (tabName === 'movement') {
            this.renderMovementTab();
        } else {
            this.renderSocialTab();
        }
    },

    renderMovementTab() {
        const { movement, pointsBreakdown } = this.data;
        const content = document.getElementById('dash-content-area');
        if (!content) return;

        content.innerHTML = `
            <div class="dash-section">
                <h3 class="section-title">🦶 내 발자국</h3>
                <div class="stats-grid">
                    <div class="stat-card">
                        <span class="stat-icon">🚶</span>
                        <span class="stat-value">${movement.totalDistance.toLocaleString()} km</span>
                        <span class="stat-label">총 이동 거리</span>
                    </div>
                    <div class="stat-card">
                        <span class="stat-icon">🔥</span>
                        <span class="stat-value">${movement.calories.toLocaleString()} kcal</span>
                        <span class="stat-label">소모 칼로리</span>
                    </div>
                    <div class="stat-card accent">
                        <span class="stat-icon">🌲</span>
                        <span class="stat-value">${movement.trees} 그루</span>
                        <span class="stat-label">심은 나무 (탄소 절감)</span>
                    </div>
                    <div class="stat-card">
                        <span class="stat-icon">⭐</span>
                        <span class="stat-value">+${pointsBreakdown.fromMovement}점</span>
                        <span class="stat-label">이동으로 획득</span>
                    </div>
                </div>
            </div>

            <div class="dash-section">
                <h3 class="section-title">🗺️ 최근 경로 (${movement.routeCount}개)</h3>
                <div class="route-list">
                    ${movement.recentRoutes.length > 0
                        ? movement.recentRoutes.map(r => this.renderRouteItem(r)).join('')
                        : '<p class="empty-state">아직 기록된 경로가 없습니다. 걸어보세요! 🚶</p>'
                    }
                </div>
            </div>
        `;
    },

    renderRouteItem(route) {
        const date = new Date(route.timestamp);
        const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;
        const durationMin = Math.round((route.duration || 0) / 60);

        return `
            <div class="route-item">
                <div class="route-icon">📍</div>
                <div class="route-info">
                    <span class="route-date">${dateStr}</span>
                    <span class="route-stats">${route.distance?.toFixed(1) || 0} km · ${durationMin}분</span>
                </div>
                <div class="route-mode">${route.mode === 'wheelchair' ? '♿' : '🚶'}</div>
            </div>
        `;
    },

    renderSocialTab() {
        const { social, pointsBreakdown } = this.data;
        const content = document.getElementById('dash-content-area');
        if (!content) return;

        content.innerHTML = `
            <div class="dash-section">
                <h3 class="section-title">💬 내 목소리</h3>
                <div class="stats-grid">
                    <div class="stat-card">
                        <span class="stat-icon">✍️</span>
                        <span class="stat-value">${social.messageCount}개</span>
                        <span class="stat-label">작성한 글</span>
                    </div>
                    <div class="stat-card">
                        <span class="stat-icon">💬</span>
                        <span class="stat-value">${social.commentCount}개</span>
                        <span class="stat-label">단 댓글</span>
                    </div>
                    <div class="stat-card accent">
                        <span class="stat-icon">❤️</span>
                        <span class="stat-value">${social.likesReceived}개</span>
                        <span class="stat-label">받은 좋아요</span>
                    </div>
                    <div class="stat-card">
                        <span class="stat-icon">🔖</span>
                        <span class="stat-value">${social.savedCount}개</span>
                        <span class="stat-label">저장한 글</span>
                    </div>
                </div>
            </div>

            <div class="dash-section">
                <h3 class="section-title">⭐ 포인트 획득 내역</h3>
                <div class="points-breakdown">
                    <div class="points-row">
                        <span>글 작성</span>
                        <span class="points-value">+${pointsBreakdown.fromMessages}점</span>
                    </div>
                    <div class="points-row">
                        <span>받은 좋아요</span>
                        <span class="points-value">+${pointsBreakdown.fromLikes}점</span>
                    </div>
                    <div class="points-row">
                        <span>댓글 작성</span>
                        <span class="points-value">+${pointsBreakdown.fromComments}점</span>
                    </div>
                </div>
            </div>

            <div class="dash-section">
                <h3 class="section-title">📜 최근 활동</h3>
                <div class="activity-timeline">
                    ${social.recentActivity.length > 0
                        ? social.recentActivity.map(a => this.renderActivityItem(a)).join('')
                        : '<p class="empty-state">아직 활동 내역이 없습니다. 글을 남겨보세요! ✏️</p>'
                    }
                </div>
            </div>
        `;
    },

    renderActivityItem(activity) {
        const date = new Date(activity.timestamp);
        const timeAgo = this.getTimeAgo(date);
        const icon = activity.type === 'message' ? '✍️' : '💬';

        return `
            <div class="activity-item" ${activity.coords ? `data-coords="${activity.coords.join(',')}"` : ''}>
                <span class="activity-icon">${icon}</span>
                <div class="activity-content">
                    <p class="activity-text">${activity.text}</p>
                    <span class="activity-time">${timeAgo}</span>
                </div>
            </div>
        `;
    },

    getTimeAgo(date) {
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 1) return '방금 전';
        if (diffMins < 60) return `${diffMins}분 전`;
        if (diffHours < 24) return `${diffHours}시간 전`;
        if (diffDays < 7) return `${diffDays}일 전`;
        return `${date.getMonth() + 1}/${date.getDate()}`;
    }
};

// 초기화
document.addEventListener('DOMContentLoaded', () => {
    DashboardManager.init();
});
