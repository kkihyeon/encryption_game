// ════════════════════════════════════════
//  LOBBY
// ════════════════════════════════════════
function switchTab(mode) {
  lobbyMode = mode;
  document.getElementById('tab-host').classList.toggle('active', mode==='host');
  document.getElementById('tab-join').classList.toggle('active', mode==='join');
  document.getElementById('host-options').style.display = mode==='host' ? '' : 'none';
  document.getElementById('lobby-btn').textContent = mode==='host' ? '▶ 방 만들기' : '▶ 참가하기';
}

function selectRound(n) {
  selectedRounds = n;
  document.querySelectorAll('.round-badge').forEach(el => {
    el.classList.toggle('active', parseInt(el.dataset.r)===n);
  });
}

function enterGame() {
  myNick = document.getElementById('user-nick').value.trim();
  const val = document.getElementById('room-id').value.trim().toUpperCase();
  if (!myNick || !val) { setLobbyStatus('닉네임과 방 코드를 입력하세요', 'error'); return; }
  roomId = 'CGv4-' + val;

  if (lobbyMode === 'host') {
    setLobbyStatus('방 생성 중...', '');
    becomeHost();
  } else {
    setLobbyStatus('접속 시도 중...', '');
    joinAsClient();
  }
}

let hostCreateRetries = 0;
let hostRetryTimer = null;

function becomeHost() {
  if (hostRetryTimer) { clearTimeout(hostRetryTimer); hostRetryTimer = null; }

  _acquireHostId();

  function _acquireHostId() {
    if (peer && !peer.destroyed) { try { peer.destroy(); } catch(e) {} }
    const delay = hostCreateRetries > 0 ? 300 : 0;
    setTimeout(() => {
      peer = createPeer(roomId);
      peer.on('open', () => {
        hostCreateRetries = 0;
        myId = roomId;
        isHost = true;
        gameState.players[myId] = { nick: myNick, score: 0, online: true };
        gameState.totalRounds = selectedRounds;
        showGameUI();
        attachHostListeners();
      });
      peer.on('error', e => {
        logPeerError('host-acquire', e);
        if (e.type === 'unavailable-id' || e.type === 'peer-unavailable') {
          hostCreateRetries++;
          if (hostCreateRetries < 8) {
            const wait = Math.min(800 + hostCreateRetries * 800, 4000);
            const sec = Math.ceil(wait / 1000);
            setLobbyStatus(`이전 연결 해제 대기 중... (${hostCreateRetries}/8, ${sec}초 후 재시도)`, '');
            hostRetryTimer = setTimeout(_acquireHostId, wait);
          } else {
            hostCreateRetries = 0;
            setLobbyStatus('방 생성 실패. 잠시 후 다시 시도하거나 다른 방 코드를 사용하세요.', 'error');
          }
        } else {
          setLobbyStatus('오류 (' + formatPeerError(e) + '). 다른 코드를 사용하세요.', 'error');
        }
      });
    }, delay);
  }
}

function attachHostListeners() {
  peer.on('connection', c => {
    c.on('open', () => {
      connections[c.peer] = c;
      c.send({ type: 'sync', state: gameState });
    });
    c.on('data', d => handleData(d, c.peer));
    c.on('close', () => {
      delete connections[c.peer];
      if (gameState.players[c.peer]) {
        gameState.players[c.peer].online = false;
        if (isHost && gameState.status === 'playing' && gameState.phase === 'encoding') {
          const encoder = gameState.turnOrder[gameState.currentTurnIdx % Math.max(gameState.turnOrder.length, 1)];
          if (encoder === c.peer) {
            const nick = (gameState.players[c.peer] && gameState.players[c.peer].nick) || '출제자';
            gameState.pendingToast = { msg: '🚪 ' + nick + ' 님이 방을 나갔습니다. 다음 출제자로 넘어갑니다.', type: 'info' };
            showToast('🚪 ' + nick + ' 님이 방을 나갔습니다. 다음 출제자로 넘어갑니다.', 'info');
            nextTurn();
            return;
          }
        }
        broadcast();
      }
    });
  });
}

function joinAsClient() {
  isHost = false;
  if (peer && !peer.destroyed) {
    try { peer.destroy(); } catch(e) {}
  }
  peer = createPeer(undefined);
  peer.on('open', id => {
    myId = id;
    const c = peer.connect(roomId, { reliable: true });
    let ok = false;
    c.on('open', () => {
      ok = true;
      conn = c;
      conn.on('data', d => handleData(d, 'host'));
      conn.on('close', () => {
        showToast('호스트와의 연결이 끊겼습니다.', 'error');
      });
      conn.send({ type: 'join', nick: myNick, peerId: myId });
      showGameUI();
    });
    c.on('error', e => {
      logPeerError('client-connect', e);
      if (!ok) setLobbyStatus('방을 찾을 수 없습니다. 호스트가 먼저 접속해야 합니다.', 'error');
    });
    setTimeout(() => {
      if (!ok) setLobbyStatus('방을 찾을 수 없습니다. 호스트가 먼저 접속해야 합니다.', 'error');
    }, 4000);
  });
  peer.on('error', e => {
    logPeerError('client-peer', e);
    setLobbyStatus('연결 오류: ' + formatPeerError(e), 'error');
  });
}

function setLobbyStatus(msg, type) {
  const el = document.getElementById('lobby-status');
  el.textContent = msg;
  el.style.color = type==='error' ? '#ff8080' : type==='ok' ? '#15803d' : 'var(--text3)';
}

function leaveRoom() {
  if (!confirm('방을 나가시겠습니까?')) return;
  if (peer) { try { peer.destroy(); } catch(e) {} }
  location.reload();
}
