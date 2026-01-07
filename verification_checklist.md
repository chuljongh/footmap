# 발길맵 정제 및 리팩토링 검증 체크리스트

## 1. 코드 무결성 및 정제 (Cleanup)
- [x] `index.html`: 중복 주석 (`<!-- 스플래시 화면 -->`) 제거 확인. (중복 없음)
- [x] `styles.css`: 중복 섹션 배너 (`Phase 3 - Navigation HUD`) 제거 확인. (완료)
- [x] `styles.css`: 미사용 변수 (`--trajectory-low/mid/high`) 제거 확인. (완료)
- [x] `styles.css`: `.hidden` 클래스 `!important` 분석 및 안전한 항목(3개) 제거 완료.
- [x] `MapManager`: 레거시 메서드 (`setSimpleDestination`) 및 중복 주석 제거 확인. (완료)

## 2. 성능 및 구조 개선 (Refactoring)
- [ ] `UIManager`: `this.elements` 캐시 도입 및 중복 DOM 쿼리 감소 확인.
- [ ] `UIManager`: 모든 주요 상호작용(메뉴, 검색, 안내)에서 캐시된 요소 사용 확인.
- [ ] 아이콘 통일: `mode-indicator`, `current-mode-icon` 등이 이모지 대신 `Icons` SVGs를 사용하는지 확인.

## 3. 기능 보완 및 데이터 무결성 (Phase 3)
- [ ] `DataCollector`: `synced` 플래그 도입 및 `syncToServer` 로직 구현 확인.
- [ ] `app.js`: 앱 시작 시 및 온라인 전환 시 자동 동기화 트리거 작동 확인.
- [ ] 대시보드: 휠체어 모드에서 주소 토글(`dash-primary`)과 경사도 표시(`dash-secondary`)가 충돌 없이 공존하는지 확인.

## 4. 수동 검증 시나리오
1. **오프라인 저장**: 개발자 도구에서 Network -> Offline 설정 후 주행 기록 저장.
   - [ ] LocalStorage/IndexedDB에 `synced: false`로 저장되는지 확인.
2. **온라인 동기화**: Network -> Online 전환.
   - [ ] `[Sync]` 로그와 함께 서버로 데이터가 전송되고 IDB에서 `synced: true`로 업데이트되는지 확인.
3. **아이콘 체크**: 모드 변경(도보/휠체어) 시 하단 아이콘이 Lucide 스타일 SVG로 부드럽게 변하는지 확인.
