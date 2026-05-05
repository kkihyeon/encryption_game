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

  const prevSession = loadSession();
  const sameSession = prevSession && prevSession.roomId === roomId && prevSession.nick === myNick;
  const prevPeerId = sameSession ? prevSession.peerId : null;

  if (lobbyMode === 'host') {
    setLobbyStatus('방 생성 중...', '');
    becomeHost();
  } else {
    setLobbyStatus('접속 시도 중...', '');
    joinAsClient(prevPeerId);
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
        gameState.hostPeerId = myId;
        gameState.players[myId] = { nick: myNick, score: 0, online: true };
        gameState.totalRounds = selectedRounds;
        saveSession();
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
      peer.on('disconnected', () => {
        if (isHost && peer && !peer.destroyed) {
          try { peer.reconnect(); } catch(e) {}
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

let clientRetries = 0;
let clientRetryTimer = null;

function joinAsClient(prevPeerId) {
  isHost = false;
  saveSession();
  if (clientRetryTimer) { clearTimeout(clientRetryTimer); clientRetryTimer = null; }

  if (peer && !peer.destroyed) {
    try { peer.destroy(); } catch(e) {}
  }
  const _prevId = prevPeerId || null;
  peer = createPeer(undefined);
  peer.on('open', id => {
    myId = id;
    saveSession();
    const c = peer.connect(roomId, { reliable: true });
    let ok = false;
    c.on('open', () => {
      ok = true; conn = c;
      clientRetries = 0;
      conn.on('data', d => handleData(d, 'host'));
      conn.on('close', () => {
        isHost = false;
        saveSession();
        showReconnectBanner();
      });
      if (_prevId && _prevId !== myId) {
        conn.send({ type: 'rejoin', nick: myNick, peerId: myId, prevPeerId: _prevId });
      } else {
        conn.send({ type: 'join', nick: myNick, peerId: myId });
      }
      showGameUI();
    });
    c.on('error', e => {
      logPeerError('client-connect', e);
      if (!ok) retryJoinAsClient(_prevId);
    });
    setTimeout(() => {
      if (!ok) retryJoinAsClient(_prevId);
    }, 4000);
  });
  peer.on('error', e => {
    logPeerError('client-peer', e);
    retryJoinAsClient(_prevId);
  });
}

function retryJoinAsClient(prevId) {
  if (clientRetryTimer) return;
  clientRetries++;
  if (clientRetries <= 12) {
    const wait = Math.min(2000 + clientRetries * 1000, 5000);
    const sec = Math.ceil(wait / 1000);
    const inGame = document.getElementById('game-ui').style.display !== 'none';
    if (inGame) {
      if (clientRetries <= 2 || clientRetries % 3 === 0) {
        showToast(`🔄 호스트 재접속 대기 중... (${clientRetries}/12)`, 'info');
      }
    } else {
      setLobbyStatus('호스트 접속 대기 중... (' + clientRetries + '/12, ' + sec + '초 후 재시도)', '');
    }
    clientRetryTimer = setTimeout(function() { clientRetryTimer = null; joinAsClient(prevId); }, wait);
  } else {
    clientRetries = 0;
    const inGame = document.getElementById('game-ui').style.display !== 'none';
    if (inGame) {
      showToast('🚫 호스트를 찾을 수 없습니다.', 'error');
    } else {
      setLobbyStatus('방을 찾을 수 없습니다. 호스트가 아직 접속하지 않았거나 방 코드를 확인하세요.', 'error');
    }
  }
}

function setLobbyStatus(msg, type) {
  const el = document.getElementById('lobby-status');
  el.textContent = msg;
  el.style.color = type==='error' ? '#ff8080' : type==='ok' ? '#15803d' : 'var(--text3)';
}

function leaveRoom() {
  if (!confirm('방을 나가시겠습니까?')) return;
  clearSession();
  clearGameState();
  if (peer) { try { peer.destroy(); } catch(e) {} }
  location.reload();
}
