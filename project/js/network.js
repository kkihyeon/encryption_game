// ════════════════════════════════════════
//  NETWORK MODE
//  WAN(PeerJS P2P) vs LAN(WebSocket) 모드 선택 및 연결 생성 (공통)
// ════════════════════════════════════════

// localStorage 설정값으로 LAN 모드 여부 확인
function isLanMode() {
  return localStorage.getItem('enc_server_mode') === 'lan';
}

// LAN 모드에서 사용할 WebSocket 서버 URL 조합
function _getWsUrl() {
  const host = (localStorage.getItem('enc_ws_host') || '127.0.0.1').trim();
  const port = (localStorage.getItem('enc_ws_port') || '9000').trim();
  return 'ws://' + host + ':' + port;
}

// WAN 모드 PeerJS 옵션 (STUN 서버 목록)
function getPeerOptions() {
  const opts = {
    debug: PEER_DEBUG_LEVEL,
    config: { iceServers: DEFAULT_ICE_SERVERS }
  };
  return opts;
}

// 모드에 따라 PeerJS(WAN) 또는 WsPeer(LAN) 인스턴스 생성
function createPeer(id) {
  if (isLanMode()) {
    const wsUrl = _getWsUrl();
    return new WsPeer(id !== undefined ? id : null, wsUrl);
  }
  return id === undefined
    ? new Peer(undefined, getPeerOptions())
    : new Peer(id, getPeerOptions());
}

function formatPeerError(e) {
  if (!e) return 'unknown';
  const t = e.type || 'error';
  const m = e.message || e.msg || '';
  return m ? `${t}: ${m}` : t;
}

function logPeerError(context, e) {
  const text = `[P2P:${context}] ${formatPeerError(e)}`;
  try { console.warn(text, e || ''); } catch(_) {}
  return text;
}

// ════════════════════════════════════════
//  WS PEER (같은망 / Python 서버 전용)
//  PeerJS API를 흉내내어 lobby.js·data.js가 WAN/LAN을 구분하지 않아도 되게 함
// ════════════════════════════════════════

// WsPeer 위에서 동작하는 단일 연결 객체 (PeerJS DataConnection 호환 인터페이스)
class WsConn {
  constructor(peer, remoteId) {
    this._peer = peer;
    this.peer = remoteId;
    this._evts = {};
  }
  on(evt, cb) {
    if (!this._evts[evt]) this._evts[evt] = [];
    this._evts[evt].push(cb);
    return this;
  }
  _emit(evt, ...args) {
    (this._evts[evt] || []).forEach(cb => { try { cb(...args); } catch(e) {} });
  }
  send(data) {
    this._peer._wsSend({ type: 'data', dst: this.peer, payload: data });
  }
  close() {
    this._peer._wsSend({ type: 'close', dst: this.peer });
    this._emit('close');
    delete this._peer._conns[this.peer];
  }
}

// Python server.py WebSocket 릴레이를 통해 P2P를 흉내내는 피어 (PeerJS Peer 호환 인터페이스)
class WsPeer {
  constructor(id, wsUrl) {
    this._reqId = id || null;
    this._wsUrl = wsUrl;
    this.id = null;
    this.destroyed = false;
    this._evts = {};
    this._conns = {};
    this._ws = null;
    this._doConnect();
  }
  on(evt, cb) {
    if (!this._evts[evt]) this._evts[evt] = [];
    this._evts[evt].push(cb);
    return this;
  }
  _emit(evt, ...args) {
    (this._evts[evt] || []).forEach(cb => { try { cb(...args); } catch(e) {} });
  }
  // WebSocket 연결 초기화 및 메시지 라우팅
  _doConnect() {
    if (this.destroyed) return;
    const url = this._wsUrl + '?id=' + encodeURIComponent(this._reqId || '__random__');
    try {
      this._ws = new WebSocket(url);
    } catch(e) {
      this._emit('error', { type: 'network', message: 'WebSocket 연결 실패: ' + (e.message || e) });
      return;
    }
    this._ws.onmessage = (e) => {
      let msg; try { msg = JSON.parse(e.data); } catch(_) { return; }
      if (msg.type === 'open') {
        this.id = msg.id;
        this._emit('open', msg.id);
      } else if (msg.type === 'error') {
        this._emit('error', { type: msg.errType || 'error', message: msg.message || '' });
      } else if (msg.type === 'connect') {
        const conn = new WsConn(this, msg.src);
        this._conns[msg.src] = conn;
        this._emit('connection', conn);
        setTimeout(() => conn._emit('open'), 0);
      } else if (msg.type === 'connect-ack') {
        const conn = this._conns[msg.src];
        if (conn) setTimeout(() => conn._emit('open'), 0);
      } else if (msg.type === 'data') {
        const conn = this._conns[msg.src];
        if (conn) conn._emit('data', msg.payload);
      } else if (msg.type === 'close') {
        const conn = this._conns[msg.src];
        if (conn) { conn._emit('close'); delete this._conns[msg.src]; }
      }
    };
    this._ws.onclose = () => {
      if (!this.destroyed) {
        Object.values(this._conns).forEach(c => { try { c._emit('close'); } catch(e) {} });
        this._conns = {};
        this._emit('disconnected');
      }
    };
    this._ws.onerror = () => {
      if (!this.destroyed) {
        this._emit('error', { type: 'network', message: 'WebSocket 연결 오류. server.py가 실행 중인지 확인하세요.' });
      }
    };
  }
  _wsSend(data) {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify(data));
    }
  }
  connect(remoteId) {
    let conn = this._conns[remoteId];
    if (!conn) { conn = new WsConn(this, remoteId); this._conns[remoteId] = conn; }
    this._wsSend({ type: 'connect', dst: remoteId });
    return conn;
  }
  reconnect() {
    if (this.destroyed) return;
    if (this._ws) { try { this._ws.close(); } catch(e) {} }
    setTimeout(() => this._doConnect(), 500);
  }
  destroy() {
    this.destroyed = true;
    if (this._ws) { try { this._ws.close(); } catch(e) {} this._ws = null; }
    Object.values(this._conns).forEach(c => { try { c._emit('close'); } catch(e) {} });
    this._conns = {};
  }
}
