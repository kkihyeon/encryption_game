# 재접속 오류 분석 및 해결 가이드

> **대상 파일**: `encrypt_v7.html`  
> **작성일**: 2026-04-19  
> **목적**: "방을 찾을 수 없습니다" 오류의 근본 원인 분석, 시나리오별 해결책, 사용자 행동 지침 기록

---

## 핵심 아키텍처 이해

### PeerJS 방 ID 구조
```
호스트 peerId == roomId == "CGv4-XXXX"
클라이언트 peerId = PeerJS가 자동 발급한 무작위 ID
```
호스트가 `new Peer("CGv4-XXXX")`로 방을 만들면, 이 ID가 곧 방 코드입니다.  
클라이언트는 `peer.connect("CGv4-XXXX")`로 호스트에 직접 연결합니다.

### PeerJS ID 보유(hold) 시간
PeerJS 클라우드 서버는 peer가 disconnect되어도 **30~60초** 동안 해당 ID를 보유합니다.  
`peer.destroy()` 호출 후에도 `new Peer(sameId)` 시도 시 → `unavailable-id` 에러가 즉시 반환됩니다.

---

## 🛠 해결 방법 — 상황별 즉시 조치

### 상황 1: 혼자 테스트 중 새로고침 후 "방을 찾을 수 없습니다"

**원인**: PeerJS 서버가 이전 방 ID를 아직 점유 중 (최대 60초)

**해결 절차**:
1. 페이지 새로고침 후 **복구 배너**가 뜨면 "🔄 복구하기" 클릭
2. 화면 하단에 `이전 연결 해제 대기 중... (1/10, 5초 후 재시도)` 메시지가 표시됨
3. **아무것도 하지 말고 기다린다** — 자동으로 최대 10회 재시도 (~최대 84초)
4. PeerJS 서버가 ID를 해제하면 자동으로 방 재생성 성공

> ⚠️ **절대 하지 말아야 할 것**: 복구 배너에서 "✕ 무시"를 누르고 "방 참가하기"로 수동 접속 시도.  
> 이렇게 하면 존재하지 않는 방에 접속하려 해 영구 실패합니다.

---

### 상황 2: 호스트 + 클라이언트 게임 중, 호스트가 새로고침

**원인**: 호스트가 나가면 클라이언트가 새 호스트로 승격되어 **방 ID가 바뀜**

**해결 절차**:
1. 이전 호스트: 페이지 새로고침 후 **복구 배너** 확인
2. "🔄 복구하기" 클릭 — 자동으로 다음을 시도:
   - 먼저 본인 방 ID 재생성 시도 (3회)
   - 실패하면 새 호스트 ID(`designatedNextHost`)로 자동 전환
   - 클라이언트로 재접속 → 기존 점수/턴순서 자동 인계
3. 화면에 `새 호스트에 접속 중...` 메시지 후 게임 화면 진입

> ✅ 기존 점수, 라운드, 턴순서 모두 유지됩니다.

---

### 상황 3: 복구 배너를 무시(닫음)한 뒤 수동 입력

**원인**: `designatedNextHost` 정보 없이 잘못된 방 ID로 접속 시도

**해결 절차**:
1. 만약 "방 참가하기" 탭으로 시도했다면 — **"방 만들기" 탭으로 전환** 후 동일한 닉네임/방코드로 접속
   - 새로고침 후 로컬에 저장된 게임 상태를 자동으로 불러와 방 재생성
2. 게임이 이미 클라이언트에 의해 진행 중이라면 — 잠시 기다렸다 "방 참가하기"로 재시도
   - 자동 8회 재시도가 진행되므로 결국 연결됨

---

### 상황 4: "이전 연결 해제 대기 중..." 메시지가 오래 지속될 때

**원인**: PeerJS 공개 서버의 ID 해제 지연 (네트워크 상태에 따라 최대 60초 이상)

**해결 절차 (빠른 우회)**:
1. 방 코드를 새 코드로 바꾸기 (예: `ALPHA7` → `ALPHA8`)
2. 호스트로 새 방 생성
3. 다른 참가자들에게 새 방 코드 공유

> 💡 **장기적 해결**: 자체 PeerJS 서버를 운영하면 ID 해제를 즉시 제어 가능 (아래 "알려진 한계" 참조)

---

### 상황 5: 게임 중 갑자기 끊긴 클라이언트가 재접속 안 될 때

**원인**: PeerJS가 기존 cliet ID를 발급 완료하지 않았거나 이전 연결 잔존

**해결 절차**:
1. 페이지 새로고침
2. 복구 배너 확인 → "🔄 복구하기" 클릭
3. 같은 닉네임으로 자동 `rejoin` 처리 → 기존 데이터 인계
4. 복구 배너가 안 보이면: 동일 닉네임 + 방코드로 "방 참가하기" → 닉네임 기반 자동 병합

---

## 🔍 오류 메시지별 원인 분석

### ❌ "방을 찾을 수 없습니다"

#### 원인 1 — 혼자 테스트 중 호스트가 새로고침 (가장 흔한 케이스)

| 단계 | 상황 |
|------|------|
| 1 | 호스트가 새로고침 → `peer.destroy()` + `saveSession()` 호출 |
| 2 | PeerJS 서버: `CGv4-XXXX` ID를 아직 30~60초 보유 중 |
| 3 | 호스트 재접속 시도: `new Peer("CGv4-XXXX")` → `unavailable-id` 즉시 반환 |
| 4 | `designatedNextHost = null` (다른 클라이언트 없음) |
| 5 | **버그 (수정 전)**: `joinAsClient("CGv4-XXXX")` 폴백 → 아무도 없는 방에 접속 시도 |
| 6 | "방을 찾을 수 없습니다" 8회 재시도 후 표시 |

**수정 후 동작**: `designatedNextHost`가 null이면 폴백하지 않고 `becomeHost` 재시도를 계속 (최대 10회, ~50초). PeerJS ID 해제 후 자동으로 방 재생성 성공.

---

#### 원인 2 — "방 참가하기" 탭으로 수동 입력 (이전 호스트)

| 단계 | 상황 |
|------|------|
| 1 | 호스트가 새로고침 후 복구 배너 무시 |
| 2 | "방 참가하기" 탭 수동 선택 |
| 3 | `enterGame()` → `lobbyMode === 'join'` |
| 4 | **버그 (수정 전)**: `designatedNextHost`가 null이어도 `joinAsClient("CGv4-XXXX")` 호출 |
| 5 | 아무도 없는 방에 연결 시도 → 실패 |

**수정 후 동작**: `designatedNextHost`가 없으면 자동으로 `becomeHost` 모드로 전환.

---

#### 원인 3 — 새 호스트 승격 타이밍 문제 (다중 클라이언트)

| 단계 | 상황 |
|------|------|
| 1 | 호스트 + 클라이언트 B 게임 중 |
| 2 | 호스트 새로고침 → PeerJS DataChannel 닫힘 신호 전송 |
| 3 | 클라이언트 B: `conn.on('close')` → `promoteToHost()` 실행 |
| 4 | 클라이언트 B: 기존 peerId(`abc123`)로 incoming connection 수신 시작 |
| 5 | 이전 호스트: 3회 `unavailable-id` 후 `joinAsClient("abc123")` 시도 |
| 6 | 클라이언트 B가 아직 준비되지 않았거나 네트워크 지연 시 실패 |

**수정 후 동작**: `retryJoinAsClient`가 최대 8회(~34초) 재시도. 클라이언트 B가 늦게 준비되어도 재시도 중에 연결됨.

---

#### 원인 4 — `beforeunload`에서 `peer.destroy()` 미완료

브라우저가 페이지를 언로드할 때 비동기 작업(WebSocket close 신호)이 완료되지 않을 수 있습니다. PeerJS 서버가 disconnect를 즉시 인지하지 못하면 ID 보유 시간이 길어집니다.

**현재 대응**: `becomeHost` 최대 10회 재시도는 이 케이스도 커버 (총 ~3+5+7+9+10+10+10+10+10+10 = ~84초).

---

## 시나리오별 재접속 흐름

### 시나리오 A: 혼자 테스트 (호스트만)

```
호스트 새로고침
  → checkRecovery(): 폼 자동 채우기 + 복구 배너 표시
  → 복구 배너 클릭 또는 직접 "접속하기"
  → becomeHost(true)
  → unavailable-id (PeerJS가 ID 보유 중)
  → 5초 대기 → 재시도 → 7초 → ... → 최대 10회
  → 약 30~60초 후 PeerJS 해제 → 방 재생성 성공 ✅
```

### 시나리오 B: 호스트 + 클라이언트(들)

```
호스트 새로고침
  ├─ 클라이언트 B: conn.close → promoteToHost() → roomId = "abc123"
  │
  └─ 이전 호스트 재접속
       → becomeHost(true) → unavailable-id 3회
       → designatedNextHost = "abc123" 확인
       → roomId = "abc123"로 변경
       → joinAsClient(이전peerId)
       → rejoin 메시지 → 기존 점수/순서 인계 ✅
```

### 시나리오 C: 이전 호스트가 클라이언트로 재접속

```
이전 호스트: "방 참가하기" 탭 수동 선택
  → enterGame()
  → designatedNextHost 확인
  ├─ 없음: becomeHost(true) 강제 전환 (혼자 테스트)
  └─ 있음: roomId = designatedNextHost → joinAsClient ✅
```

---

## localStorage 키 구조

```javascript
// 세션 정보 (30분 유효)
enc_game_session = {
  nick: "닉네임",
  roomId: "CGv4-XXXX",      // 원래 방 코드 (호스트의 peerId)
  peerId: "CGv4-XXXX",      // 이 플레이어의 마지막 peerId
  isHost: true/false,
  ts: 1234567890           // 저장 타임스탬프
}

// 게임 상태 (모든 플레이어가 저장)
enc_game_state = {
  status: "playing",
  players: { "CGv4-XXXX": {nick, score, online}, ... },
  turnOrder: [...],
  designatedNextHost: "abc123" | null,  // ← 재접속의 핵심 키
  currentRound: 2,
  ...
}
```

### `designatedNextHost`의 역할
- 호스트가 `broadcast()` 시마다, 온라인 클라이언트 중 첫 번째를 지정
- 호스트 이탈 시: 이 ID의 클라이언트가 새 호스트로 승격
- 이전 호스트 복귀 시: 이 ID로 `roomId`를 교체하여 접속 가능

---

## 코드상 실패 지점 맵

```
enterGame()
  └─ isHost prevSession + join tab
       └─ designatedNextHost = null? → [수정 전: joinAsClient(CGv4) ❌]
                                      [수정 후: becomeHost(true) ✅]

becomeHost(isRecover=true)
  └─ unavailable-id × 3
       └─ designatedNextHost = null? → [수정 전: joinAsClient(CGv4) ❌]
                                       [수정 후: 재시도 fall-through ✅]
       └─ designatedNextHost = "abc123"? → [joinAsClient("abc123") ✅]
```

---

## 알려진 한계 및 장기 해결책

| 한계 | 설명 | 즉시 우회 | 장기 해결 |
|------|------|-----------|-----------|
| PeerJS ID 보유 60초 | 빠른 재접속 불가 | 기다리거나 새 방코드 사용 | 자체 PeerJS 서버 운영 |
| `beforeunload` 비동기 미완료 | `peer.destroy()` 신호 미전달 가능 | 자동 10회 재시도가 커버 | 자체 서버에서 강제 disconnect API 호출 |
| 자체 PeerJS 서버 없음 | 공개 서버 가용성 제한 | 재시도 대기 | `new Peer(id, {host, port, path})` 자체 서버 설정 |
| 세션 30분 만료 | 30분 이상 이탈 시 복구 불가 | 게임 재시작 | `loadSession()`의 `30 * 60 * 1000` 값 증가 |
| `designatedNextHost` 단일 실패 | 백업 호스트가 오프라인이면 방 붕괴 | 다른 참가자가 재접속 | 백업 후보 다중화 (turnOrder 순서대로 fallback) |

### 자체 PeerJS 서버 설정 방법 (장기 해결)

```javascript
// 현재 코드
peer = new Peer(roomId, { debug: 0 });

// 자체 서버 적용 시
peer = new Peer(roomId, {
  host: 'your-peerjs-server.com',
  port: 9000,
  path: '/peerjs',
  debug: 0,
  config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
});
```

자체 서버에서는 `DELETE /peerjs/peers/{peerId}` API로 ID를 즉시 해제할 수 있어 재접속이 거의 즉시 가능합니다.
