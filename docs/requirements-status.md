# 암호화 대전 게임 — 요구사항 구현 현황

> **대상 파일**: `project/src.html` + `project/src.css` + `project/js/*.js`
> **최종 수정일**: 2026-05-05
> **목적**: 요구사항 구현 상태 추적 및 정적 분석 결과 기록

---

## 범례

| 상태 | 의미 |
|------|------|
| ✅ 적용됨 | 요구사항이 코드에 완전히 구현됨 |
| ⚠️ 부분 적용 | 일부만 구현되었거나 의도와 다르게 동작 중 |
| ❌ 미적용 | 코드에 해당 기능이 전혀 없음 |

---

## 1. 출제자 암호문 및 키 입력

**요구사항**: 암호화 종류 선택 후, 출제자가 직접 암호화될 암호문과 **키**를 입력해야 한다.

**현재 상태**: ✅ 적용됨

- 암호화 방식 선택 시 해당 방식에 맞는 키 입력 필드가 동적으로 생성됨 (`renderKeyInput()` — `game.js`)
- 방식별 키 기본값: 키 순서(순열, 예: 21), 애너그램(단위 크기, 예: 3), 카이사르(시프트, 예: 3), 스키테일(레일 수, 예: 3)
- 암호화 함수(`caesarEnc`, `keyEnc`, `scytaleEnc`, `anagramEnc`)가 키 파라미터를 받도록 구현됨 (`cipher.js`)
- 키값은 `gameState.currentKeys` 필드에 저장되어 모든 플레이어에게 전파됨 (`state.js`)
- 출제 제출(`enc_submit`) 메시지에 `keys` 객체 포함 (`game.js:submitEncoding`)

---

## 2. 틀릴 시 점수 처리 (감점 / 음수 점수 방지)

**요구사항**: 틀리면 점수 X 또는 감점. 음수 점수는 없다.

**현재 상태**: ✅ 적용됨

- `data.js:guess_submit` 처리: 오답 시 0점 부여 (점수 X)
- 음수 점수가 발생하는 로직 없음
- 정답 시: `10 + Math.floor(timeLeft * 0.04)` (기본 10pt + 시간 보너스)

**비고**: "감점" 방식은 구현되어 있지 않음 (0점 처리). 감점 원하면 `Math.max(0, score - penalty)` 패턴 추가 필요.

---

## 3. 정답자에게 출제자가 사용한 키값 공개

**요구사항**: 문제를 맞춘 사람들은 출제자가 사용한 키값을 알 수 있어야 한다.

**현재 상태**: ✅ 적용됨

- `round_end` 페이즈에서 `renderCenter()` (`render.js`)가 정답자 또는 출제자에게만 키값 chip 표시
- 조건: `myResult?.correct || iAmEncoder`
- 표시 형태: `🔑 카이사르: 키=3 → 스키테일: 키=4`

---

## 4. 암호화 방식 2개 사용 시 종류(순서 X)를 힌트로 제공

**요구사항**: 암호화 방식을 2개 사용하면 제출자들에게 순서가 아닌 종류만 알려주어야 한다.

**현재 상태**: ✅ 적용됨

- `data.js:enc_submit` 처리: `methods.length >= 2` 조건 하에 `[...methods].sort((a, b) => a - b)` 로 ID 오름차순 정렬하여 `clueSet` 생성 (인코딩 순서 비공개)
- `renderCenter()` (`render.js`)에서 `clueSet`을 순회하며 `${m.name} ${keyLabel}: ${keyVal}` 형태로 힌트 chip 표시

---

## 5. 암호화 방식 1개 사용 시 힌트 비공개

**요구사항**: 암호화 방식을 1개만 사용했을 때는 해독자들에게 암호화 방식을 알려주지 않아야 한다.

**현재 상태**: ✅ 적용됨

- `data.js`: `methods.length >= 2`일 때만 `clueSet`을 채우고, 1개일 때는 `clueSet = []` → 방식명 힌트 chip 미표시
- `renderGuessUI()` (`game.js`): 1개 방식 시 순서 선택 버튼 미렌더링; 라벨 "원본 메시지 입력"으로 변경
- 해독 단계에서 키값(`키: ${keyVal}`)은 공개 — 의도된 설계 (방식명은 숨기고 키만 공개)

---

## 6. 메모장 모드 (텍스트 입력) / 그리기 모드 전환

**요구사항**: 메모장 모드(텍스트 입력)와 그리기 모드가 있어야 한다.

**현재 상태**: ✅ 적용됨

- 툴바에 `🎨 그리기` / `📝 메모장` 전환 버튼 (`src.html`)
- `setBoardMode('draw')` / `setBoardMode('memo')` 함수로 전환 (`canvas.js`)
- `#memo-area` (`<textarea>`)가 캔버스와 동일 영역에 위치; 개인 메모용 (공유 안 됨)
- 모드 전환 시 그리기 도구 버튼(펜, 지우기, 색상, 삭제) 자동 표시/숨김

---

## 7. 게임 가이드 탭 (로비 화면)

**요구사항**: 게임 시작 전 로비에 "게임 가이드" 탭이 있어야 하며, 게임 가이드와 암호화 가이드를 선택할 수 있어야 한다.

**현재 상태**: ✅ 적용됨

- 로비 카드 상단에 `📖 게임 가이드` 버튼 (`src.html`)
- 클릭 시 `openGuide()` 호출 → `#guide-overlay`에 `visible` 클래스 추가 (`render.js`)
- 오버레이 헤더에 `🎮 게임 가이드` / `🔐 암호화 가이드` 탭 전환 UI (`switchGuideTab()`, `render.js`)
- X 버튼 클릭 시 `closeGuide()` → 오버레이 닫힘

---

## 7-1. 게임 가이드 탭 콘텐츠

**요구사항**: 게임 화면 기능들을 소개한다.

**현재 상태**: ✅ 적용됨

- `#gpanel-game` 패널에 실제 게임 화면 구성을 모사한 annotated mock UI + 번호 설명 카드
- 상단 헤더(페이즈/타이머/라운드), 좌측 패널(참가자/순위), 중앙 캔버스/암호문, 액션 영역 모두 설명

---

## 7-2. 암호화 가이드 탭 콘텐츠

**요구사항**: 각 암호화 방식에 대한 설명을 볼 수 있어야 한다.

**현재 상태**: ✅ 적용됨

- `#gpanel-cipher` 패널에 4가지 암호화 방식별 설명 카드 (SVG 다이어그램 + 예시 포함)

| 방식 | 키 | 설명 |
|------|----|------|
| 키 순서 (KEY) | 순열 숫자 (예: 312) | 단위별 글자를 키 순서로 재배열 |
| 애너그램 (ANA) | 단위 크기 (예: 3) | 단위별 역순으로 뒤집기 |
| 카이사르 (CAE) | 시프트 (1–25) | 알파벳 n칸 오른쪽 이동 |
| 스키테일 (SKY) | 레일 수 (2–10) | 격자 채우고 열 방향으로 읽기 |

---

## 요약 테이블

| # | 요구사항 | 상태 | 구현 위치 |
|---|---------|------|----------|
| 1 | 출제자 키 입력 필드 | ✅ | `game.js:renderKeyInput`, `cipher.js`, `state.js:gameState.currentKeys` |
| 2 | 틀리면 점수 X, 음수 없음 | ✅ | `data.js:guess_submit` |
| 3 | 정답자에게 키값 공개 | ✅ | `render.js:renderCenter` round_end 분기 |
| 4 | 2개 방식: 종류만 힌트 공개 | ✅ | `data.js:clueSet` 정렬, `render.js:renderCenter` |
| 5 | 1개 방식: 힌트 비공개 | ✅ | 방식명 숨김, 키값은 공개 (의도된 설계) |
| 6 | 메모장 모드 | ✅ | `canvas.js:setBoardMode`, `src.html:#memo-area` |
| 7 | 게임 가이드 탭 | ✅ | `render.js:openGuide/switchGuideTab`, `src.html:#guide-overlay` |
| 7-1 | 게임 가이드: 화면 소개 | ✅ | `src.html:#gpanel-game` |
| 7-2 | 암호화 가이드: 방식 설명 | ✅ | `src.html:#gpanel-cipher` |

---

## 정적 분석 결과 (2026-05-05)

### ✅ 해결 완료

| 항목 | 조치 |
|------|------|
| `autoFillEnc()` 미연결 dead code | `game.js`에서 함수 제거 (수동 암호화 의도 확인) |
| `enc-input-1` 이중 핸들러 / `onEncInput()` dead code | HTML 인라인 핸들러 제거, `onEncInput()` 함수 제거 |
| `initCanvas()` 중복 이벤트 리스너 등록 | `canvas.js`에 `_initialized` 가드 추가 |
| 요구사항 5 키값 공개 여부 | 방식명 숨기고 키값은 공개 — 의도된 설계로 확인 |



### ✅ 이상 없음

- **DOM ID 전수 검증**: JS에서 참조하는 모든 정적 ID가 `src.html`에 존재함 (`key-input-0/1`은 동적 생성, 정상)
- **스크립트 로딩 순서**: 10개 파일 모두 의존성 순서 준수 (`cipher → state → network → canvas → render → lobby → data → game → settings → init`)
- **파싱 시점 DOM 접근**: `state.js`의 `getElementById('shared-canvas')` 및 `game.js`의 인라인 핸들러 할당 모두 `<body>` 끝 위치에서 문제없음
- **함수 크로스 레퍼런스**: 파일 간 모든 함수 호출은 런타임 시점에 정의 완료됨 (로딩 완료 후 사용자 상호작용이 시작되므로 순환 의존 문제 없음)

---

## 코드 구조

```
project/
├── src.html          HTML 골격 (로비, 게임UI, 게임오버, 가이드 오버레이)
├── src.css           전체 CSS (변수, 레이아웃, 컴포넌트)
├── server.py         HTTP + WebSocket 서버 (LAN 모드 / PyInstaller exe)
└── js/
    ├── cipher.js     암호화 알고리즘 (METHODS, caesarEnc, keyEnc, scytaleEnc, anagramEnc, applyEnc)
    ├── state.js      전역 상태 (gameState, peer, canvas, ctx, 상수)
    ├── network.js    네트워크 추상화 (createPeer, WsPeer, WsConn)
    ├── canvas.js     캔버스 드로잉, 모드 전환, 리액션
    ├── render.js     렌더링 (renderAll, renderCenter, showToast, 가이드 UI)
    ├── lobby.js      로비 로직 (becomeHost, joinAsClient, 재연결)
    ├── data.js       데이터 처리 (handleData, broadcast, 세션 복구)
    ├── game.js       게임 흐름 (hostStartGame, nextTurn, 암호화/해독 제출 UI)
    ├── settings.js   네트워크 설정 패널
    └── init.js       초기화 진입점
```
