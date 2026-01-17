# APK 환경에서 서버 데이터 동기화 실패 문제 해결

## 📋 문제 개요

**증상**: 모바일 APK에서 사용자가 경로를 이동해도 서버에 데이터가 전혀 저장되지 않음.
- "My Records" 탭에서 이동 기록이 0으로 표시
- Debug Overlay에서 `Sync: Idle` 상태 유지

**환경**: Cordova/Capacitor APK + Flask 백엔드(Render 호스팅)

---

## 🔍 근본 원인 분석

### 원인 1: `Config.API_BASE_URL` 누락 (핵심 원인)

**문제 코드** ([data_collector.js](file:///d:/aaa/balgil-map/js/data_collector.js)):
```javascript
// 상대 경로 사용
const response = await fetch(`/api/users/${userId}/routes`, { ... });
```

**APK 환경에서의 동작**:
- 웹 브라우저: `/api/...` → `http://localhost:8000/api/...` (정상)
- APK: `/api/...` → `file:///api/...` 또는 `app:///api/...` (실패)

**해결**: [config.js](file:///d:/aaa/balgil-map/js/config.js)에 `API_BASE_URL` 추가
```javascript
const Config = {
    API_BASE_URL: 'https://balgilmaeb.onrender.com',
    // ...
};
```

그리고 [data_collector.js](file:///d:/aaa/balgil-map/js/data_collector.js#L97)에서 절대 경로 사용:
```javascript
const response = await fetch(`${Config.API_BASE_URL}/api/users/${userId}/routes`, { ... });
```

---

### 원인 2: 실시간 전송 로직 부재

**문제**: 기존 코드는 "경로 안내 종료" 버튼을 눌러야만 데이터를 전송하도록 설계됨.

**코드 흐름 (수정 전)**:
```
GPS 이동 → AppState.routeHistory에 저장 (메모리)
    ↓
사용자가 "종료" 버튼 클릭
    ↓
processAndSaveRoute() → saveRoute() → saveToServer()
```

**해결**: [ui_manager.js](file:///d:/aaa/balgil-map/js/ui_manager.js)에 1초 주기 타이머 추가

```javascript
// handleNavigateStart() 함수 내부
AppState.realtimeSyncTimer = setInterval(() => {
    if (AppState.routeHistory && AppState.routeHistory.length >= 2) {
        this.processAndSaveRoute();
    }
}, 1000);
```

**정리 코드** (executeNavigationStop):
```javascript
if (AppState.realtimeSyncTimer) {
    clearInterval(AppState.realtimeSyncTimer);
    AppState.realtimeSyncTimer = null;
}
```

---

### 원인 3: Debug Overlay 미동작

**문제**: 디버깅용 오버레이가 화면에 표시되지 않아 문제 진단 불가.

**원인들**:
1. [index.html](file:///d:/aaa/balgil-map/index.html)에 script 태그 누락
2. GPS/Sync 상태를 오버레이에 전달하는 Hook 코드 누락

**해결**:

1. **Script 태그 추가** (index.html):
```html
<script src="js/debug_overlay.js?v=1.0" defer></script>
```

2. **GPS Hook 추가** ([map_manager.js](file:///d:/aaa/balgil-map/js/map_manager.js#L328)):
```javascript
navigator.geolocation.watchPosition((position) => {
    // ... 기존 코드 ...

    if (typeof DebugOverlay !== 'undefined') {
        DebugOverlay.update({
            gps: {
                lat: position.coords.latitude,
                lon: position.coords.longitude,
                acc: position.coords.accuracy
            }
        });
    }
});
```

3. **Sync Hook 추가** ([data_collector.js](file:///d:/aaa/balgil-map/js/data_collector.js#L111)):
```javascript
// 성공 시
if (typeof DebugOverlay !== 'undefined') DebugOverlay.update({ sync: 'Success (POST)' });

// 실패 시
if (typeof DebugOverlay !== 'undefined') DebugOverlay.update({ sync: `Fail (POST): ${e.message}` });
```

---

## 📊 수정된 파일 목록

| 파일 | 변경 내용 |
|------|----------|
| `js/config.js` | `API_BASE_URL` 추가 |
| `js/data_collector.js` | 절대 URL 사용 + Debug Hook 추가 |
| `js/ui_manager.js` | 1초 실시간 동기화 타이머 + HUD 동적 갱신 |
| `js/map_manager.js` | GPS Debug Hook 추가 |
| `js/debug_overlay.js` | 테스트 버튼 + 자동 초기화 로직 |
| `index.html` | debug_overlay.js script 태그 추가 |

---

## 🧪 검증 방법

### 로컬 테스트
1. `python server.py` 실행
2. `http://localhost:8000` 접속
3. Debug Overlay의 "🧪 테스트 전송" 버튼 클릭
4. `Sync: Success (POST)` 확인

### APK 테스트
1. 앱 실행 시 "DEBUG SYSTEM LOADED" 알림 확인
2. 목적지 설정 → 경로 안내 시작
3. 이동하면서 Debug Overlay 확인:
   - `GPS`: 실시간 좌표 업데이트
   - `Dist`: 누적 거리 증가
   - `Sync`: 1초마다 `Success (POST)` 표시

---

## ⚠️ 후속 작업 (선택)

1. **디버깅 코드 제거**: 프로덕션 배포 전 `alert()` 및 테스트 버튼 삭제
2. **중복 전송 방지**: 현재 1초마다 전체 데이터를 재전송하므로, 증분 전송 로직 필요
3. **동기화 주기 최적화**: 1초 → 30초로 변경하여 서버 부하 감소

---

## 🔴 [2026-01-17 추가] 진짜 원인 발견!

위 내용만으로는 문제가 해결되지 않았습니다. 추가 디버깅 결과, **진짜 원인**을 발견했습니다.

### 증상

- `Sync: Tick(G): 10 -> Saving...` 표시됨 (타이머 정상 작동)
- 하지만 DB에 데이터 0건
- Console에서 `DataCollector.db` 확인 시 `undefined`

### 진짜 원인: `Promise.all`로 인한 병렬 초기화 (Race Condition)

```javascript
// app.js (문제의 코드)
await Promise.all([
    UIManager.init(),       // 1. 화면 그리기 (빠름)
    DataCollector.init()    // 2. DB 켜기 (느림)
]);
// await이 있지만, 둘은 동시에 출발합니다!
```

`await Promise.all()`은 내부 함수들을 **동시에 실행**합니다.
`UIManager`가 먼저 완료되어 이벤트를 활성화시키면, **DB가 아직 준비되지 않은 상태**에서 데이터 저장을 시도하게 됩니다.

### 비유

> 🍳 **요리 재료 준비(DB)와 손님 입장(UI)을 동시에 시작함**
>
> → 손님이 들어와서 주문했는데, 재료가 아직 도착 안 함

### 검증 방법

Console에서 수동으로 초기화 후 테스트:

```javascript
// 1. 수동 초기화 (순서대로)
await DataCollector.init()

// 2. DB 확인
DataCollector.db  // → IDBDatabase {...} ✅

// 3. 저장 테스트 → Sync: Success (POST) ✅
```

**결과**: 50개 데이터가 DB에 저장됨! 🎉

### 해결책

**"동시 출발"에서 "순서대로" 변경**

```javascript
// app.js (수정된 코드)
// 1. DB 먼저 확실히 켜고! (기다림)
await DataCollector.init();

// 2. 그 다음 나머지 실행
await Promise.all([
    UIManager.init(),
    SocialManager.init()
]);
```

### 교훈

| 문서에서 진단한 원인 | 실제 원인 |
|---------------------|----------|
| "코드가 없다" | **"코드가 있는데 순서가 잘못됐다 (병렬 실행)"** |

**데이터베이스 초기화처럼 중요한 작업은 `Promise.all`에서 빼서 반드시 먼저 완료되도록 해야 합니다.**
