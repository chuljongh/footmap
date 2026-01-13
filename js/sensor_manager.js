// ========================================
// 센서 기반 이동수단 판별 (SensorManager)
// ========================================
const SensorManager = {
    motionData: [],
    MAX_DATA_POINTS: 50,
    VARIANCE_THRESHOLD: 1.5, // 도보와 휠체어를 구분하는 가속도 분산 임계값

    init() {
        if (window.DeviceMotionEvent) {
            window.addEventListener('devicemotion', (e) => this.handleMotion(e));
        } else {
            console.warn('⚠️ 이 브라우저는 가속도 센서를 지원하지 않습니다.');
        }
    },

    // MapManager에서 위치 업데이트 시 호출
    updateSpeed(speedMps) {
        if (speedMps === null || speedMps === undefined) return;

        const speedKph = speedMps * 3.6; // m/s -> km/h 변환

        if (speedKph > Config.SPEED_THRESHOLD) {
            this.setMode('vehicle');
        } else {
            this.detectSubMode();
        }
    },

    handleMotion(event) {
        const acc = event.accelerationIncludingGravity;
        if (!acc) return;

        // 전체 가속도 크기계산
        const totalAcc = Math.sqrt(acc.x ** 2 + acc.y ** 2 + acc.z ** 2);
        this.motionData.push(totalAcc);

        if (this.motionData.length > this.MAX_DATA_POINTS) {
            this.motionData.shift();
        }
    },

    detectSubMode() {
        if (this.motionData.length < 20) return;

        // 가속도 데이터의 분산(Variance) 계산
        const mean = this.motionData.reduce((a, b) => a + b, 0) / this.motionData.length;
        const variance = this.motionData.reduce((a, b) => a + (b - mean) ** 2, 0) / this.motionData.length;

        // 분산이 크면 흔들림이 많은 '도보', 작으면 '휠체어'로 판별
        const detectedMode = variance > this.VARIANCE_THRESHOLD ? 'walking' : 'wheelchair';

        // 현재 모드가 'vehicle'이거나 감지된 모드와 다를 경우 업데이트
        if (AppState.userMode !== detectedMode) {
            this.setMode(detectedMode);
        }
    },

    setMode(mode) {
        if (AppState.userMode === mode) return;

        AppState.userMode = mode;

        // UI 업데이트
        if (typeof UIManager !== 'undefined' && UIManager.updateModeIndicator) {
            UIManager.updateModeIndicator();
        }

        // 차량 모드일 경우 기록 중지 등 추가 로직 가능
        if (mode === 'vehicle') {
            // 차량 모드 로직 (필요시)
        }
    }
};

// Explicit Global Export
window.SensorManager = SensorManager;
