# 호스트 재접속 실패 원인 분석 및 참가자 비교

---

## 1. 아키텍처 전제

```
호스트 PeerJS ID = 방 코드 ("CGv4-XXXX")  ← 고정 ID
참가자 PeerJS ID = 랜덤 UUID               ← 매번 새로 발급
```

PeerJS 브로커 서버(peerjs.com)는 피어 연결이 끊길 때 해당 ID를 **즉시 해제하지 않는다.**  
통상 **60~120초** 동안 ID를 보유하며, 그 사이 동일 ID로 재접속을 시도하면 `unavailable-id` 오류가 발생한다.

- 참가자는 랜덤 ID를 쓰므로 이 문제가 없음.
- 호스트만 고정 ID를 쓰므로 이 문제가 발생함.

---

## 2. 호스트 재접속 실패 — 버그 #1: saveSession() 타이밍 오류

### 코드 위치: `becomeHost()` 첫 줄

```js
function becomeHost(isRecover, fallbackPrevId) {
  saveSession();   // ← 문제: 이 시점에 isHost === false
  ...
}
```

### saveSession() 내부

```js
function saveSession() {
  const data = JSON.stringify({ nick: myNick, roomId, peerId: myId, isHost, ts: Date.now() });
  if (isHost) {
    localStorage.setItem(SESSION_KEY_HOST, data);   // isHost=true 일 때만
  } else {
    localStorage.setItem(SESSION_KEY_CLIENT, data); // ← isHost=false이면 CLIENT 키에 저장됨
  }
}
```

### 버그 체인

```
enterGame()
  → loadSession()                         // SESSION_KEY_HOST에서 isHost=true 로드 → isRecover=true
  → becomeHost(isRecover=true, prevPeerId)
      → saveSession()                     // isHost 전역변수는 아직 false
                                          // → SESSION_KEY_CLIENT에 {isHost:false} 저장
                                          // SESSION_KEY_HOST는 건드리지 않음 (이건 OK)
      → probe 시작
          → 실패 (_probeFail)
          → hostCreateRetries = 1 세팅
          → 1초 후 becomeHost() 재호출
              → saveSession() 또 호출     // 여전히 isHost=false → CLIENT에 저장 반복
              → new Peer(roomId, ...)     // PeerJS 서버에서 ID 아직 보유 중
              → unavailable-id 오류
              → 재시도 8회 반복
```

> **실질적 피해**: `SESSION_KEY_HOST`는 건드리지 않으므로 복구 데이터는 유지된다.  
> **그러나** 재시도가 모두 실패하면 사용자에게 방 생성 실패 메시지만 보임.

---

## 3. 호스트 재접속 실패 — 버그 #2: 경쟁 조건 (Race Condition)

게임 진행 중 호스트가 끊기면:

```
T+0s:   호스트 연결 끊김
        ├── 호스트: 재접속 시도 시작
        │     probe → 실패(방 없음, 1초 대기)
        │     T+1s: ID 재취득 시도 → unavailable-id
        │     T+1.8s: 재시도 (1.6s 간격)
        │     T+3.4s: 재시도 (2.4s 간격)
        │     ...
        │
        └── 클라이언트(designatedNextHost): showReconnectBanner()
              → 5초 대기 후 checkHostReturn() 시작
              T+5s: probe → 실패(방 없음) → promoteToHost() 시작
              T+5s: new Peer(CGv4-XXXX) 시도 → unavailable-id
              T+8s: 재시도 ...
```

**동시에 호스트와 클라이언트가 같은 PeerJS ID(`CGv4-XXXX`)를 취득하려 경쟁한다.**

PeerJS 브로커는 선착순으로 처리하므로:
- 클라이언트가 먼저 취득 → 클라이언트가 새 호스트가 됨
- 원 호스트는 `unavailable-id`를 계속 받으며 포기

---

## 4. 호스트 재접속 실패 — 버그 #3: probe 연결 오감지

```js
const tc = probePeer.connect(roomId, { reliable: false });
tc.on('open', () => {
  // 방 살아있음 → 클라이언트로 즉시 참가
  joinAsClient(fallbackPrevId);
});
tc.on('error', () => _probeFail());
```

`reliable: false`는 UDP 계열로, 서버가 ID를 보유 중인 경우 **연결 성공처럼 보이는 false positive**가 발생할 수 있다.  
즉, 방이 실제로 없는데 `tc.on('open')`이 발화하면 호스트가 클라이언트로 전환되어 버린다.

---

## 5. 참가자 재접속 vs 호스트 재접속 로직 비교

| 항목 | 참가자 재접속 | 호스트 재접속 |
|------|-----------|-----------|
| **PeerJS ID** | 랜덤 UUID (매번 새로 발급) | 고정 `CGv4-XXXX` (이전 ID 재사용) |
| **브로커 서버 충돌** | 없음 | **있음** (60~120초 ID 보유) |
| **경쟁 상대** | 없음 | designatedNextHost 클라이언트가 동일 ID 취득 시도 |
| **재접속 진입점** | `joinAsClient(prevPeerId)` | `becomeHost(isRecover=true, prevPeerId)` |
| **첫 번째 동작** | 즉시 `new Peer(undefined)` | probe로 방 생존 여부 확인 (2초 대기) |
| **성공 조건** | 호스트(`CGv4-XXXX`)에 연결만 되면 OK | 브로커 서버가 ID를 해제해야 성공 |
| **상태 복원** | `rejoin` 메시지 → 호스트가 닉네임 기반 병합 | `loadGameState()` → 로컬 저장 상태 직접 복원 |
| **타임아웃 후 폴백** | 8회 재시도 후 실패 메시지 | 8회 재시도 후 실패 메시지 (클라이언트 전환 없음) |
| **saveSession() 시점** | `peer.on('open')` 직후 (myId 확정 후) | `becomeHost()` 진입 즉시 (**isHost=false 상태**) |

---

## 6. 참가자 재접속 플로우 (성공하는 이유)

```
joinAsClient(prevPeerId)
  │
  ├─ new Peer(undefined)       → 랜덤 ID 즉시 발급, 충돌 없음
  ├─ peer.on('open', id)       → myId = id (새 ID)
  ├─ conn = peer.connect(CGv4-XXXX)
  ├─ conn.on('open')           → 연결 성공
  │     send({ type: 'rejoin', prevPeerId: 이전ID })
  │     showGameUI()
  │
  └─ 호스트 측 rejoin 처리
        gameState.players[이전ID] → [새ID]로 이전
        turnOrder 업데이트
        broadcast()             → 전체 동기화
```

**핵심**: 참가자는 새 ID를 쓰기 때문에 브로커 서버 충돌이 없고, 호스트가 상태를 보존해주므로 재접속이 바로 성공한다.

---

## 7. 호스트 재접속 플로우 (실패하는 이유)

```
becomeHost(isRecover=true, prevPeerId)
  │
  ├─ saveSession()             ← isHost=false → CLIENT 키에 저장 (버그 #1)
  │
  ├─ [probe 단계] new Peer(undefined)
  │     connect(CGv4-XXXX)    → 방이 없으므로 실패 → _probeFail()
  │     hostCreateRetries = 1
  │     1초 후 재호출
  │
  └─ [ID 재취득 단계] new Peer(CGv4-XXXX)
        PeerJS 서버에 CGv4-XXXX가 아직 보유 중
        → unavailable-id 오류
        → 1.6s 후 재시도
        → 2.4s 후 재시도
        → 3.2s 후 재시도
        ...
        [T+5s] 클라이언트(designatedNextHost)도 CGv4-XXXX 취득 시도 시작 ← 경쟁 (버그 #2)
        ...
        8회 실패 후 → "방 생성 실패" 메시지 (사용자에게 포기로 보임)
```

---

## 8. 근본적 해결 방향

### 단기 (현재 구조 유지)
- `becomeHost()`의 `saveSession()` 제거 또는 HOST 키로 강제 저장
- 클라이언트 승격 대기 시간을 **15~20초**로 늘려 호스트가 ID를 재취득할 시간 확보
- 호스트 재접속 포기 후 "클라이언트로 재참가" 폴백 자동 실행

### 장기 (구조 변경)
- 방 코드와 호스트 PeerJS ID를 분리
  - 방 코드: 사용자가 공유하는 숫자 코드
  - 호스트 ID: 매번 새 랜덤 UUID 사용
  - 참가자가 "방 코드 조회 서버"를 통해 현재 호스트 ID를 얻음
- 이렇게 하면 호스트 재접속도 참가자와 동일한 방식(랜덤 ID)으로 처리 가능

---

## 9. 즉시 수정 가능한 항목 요약

| 버그 | 위치 | 수정 방법 |
|------|------|---------|
| #1 `saveSession()` 타이밍 | `becomeHost()` 첫 줄 | HOST 키에 강제 저장하도록 수정 |
| #2 경쟁 조건 | `showReconnectBanner()` 5초 타이머 | 승격 대기 시간 15초로 늘림 |
| #3 probe false positive | `reliable: false` 옵션 | `reliable: true`로 변경 |
| 재접속 포기 후 폴백 없음 | `hostCreateRetries >= 8` 블록 | 자동으로 클라이언트 탭으로 전환 |
