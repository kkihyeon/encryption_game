// ════════════════════════════════════════
//  DATA HANDLING
// ════════════════════════════════════════
function handleData(data, fromId) {
  if (data.type === 'sync') {
    const prevTurnIdx = gameState.currentTurnIdx;
    const prevPhase = gameState.phase;
    gameState = data.state;
    if (gameState.pendingToast) {
      showToast(gameState.pendingToast.msg, gameState.pendingToast.type || 'info');
      gameState.pendingToast = null;
    }
    if (gameState.currentTurnIdx !== prevTurnIdx && gameState.phase === 'encoding') {
      resetLocalState();
    }
    if (!isHost && (gameState.phase === 'encoding' || gameState.phase === 'guessing')) {
      if (gameState.currentTurnIdx !== prevTurnIdx || gameState.phase !== prevPhase) {
        startClientTimer();
      }
    }
    if (!isHost && gameState.phase !== prevPhase) {
      saveSession();
    }
    saveGameState();
    renderAll();
    return;
  }

  if (!isHost) {
    if (data.type === 'enc_invalid') {
      showEncError('❌ 암호화 결과가 올바르지 않습니다. 다시 확인해주세요.');
      return;
    }
    if (data.type === 'guess_result') {
      if (data.correct) {
        showToast(`✅ 정답! +${data.points}pt 획득!`, 'success');
      } else {
        showGuessError('❌ 오답! 계속 시도할 수 있습니다.');
        const btn = document.getElementById('btn-guess-submit');
        if (btn) { btn.disabled = false; btn.textContent = '해독 완료 🛡'; }
      }
      return;
    }
    if (data.type === 'reaction') {
      showFloatingReaction(data.emoji);
      return;
    }
    return;
  }

  // ── 호스트 전용 처리 ──
  if (data.type === 'rejoin') {
    const prev = data.prevPeerId;
    const existing = gameState.players[prev];
    if (existing && existing.nick === data.nick) {
      gameState.players[fromId] = { ...existing, nick: data.nick, online: true };
      delete gameState.players[prev];
      const idx = gameState.turnOrder.indexOf(prev);
      if (idx !== -1) gameState.turnOrder[idx] = fromId;
      else if (!gameState.turnOrder.includes(fromId)) gameState.turnOrder.push(fromId);
      if (gameState.guessResults && gameState.guessResults[prev]) {
        gameState.guessResults[fromId] = gameState.guessResults[prev];
        delete gameState.guessResults[prev];
      }
    } else {
      let merged = false;
      for (const [pid, p] of Object.entries(gameState.players)) {
        if (pid !== fromId && p.nick === data.nick && p.online === false) {
          gameState.players[fromId] = { ...p, online: true };
          delete gameState.players[pid];
          const idx = gameState.turnOrder.indexOf(pid);
          if (idx !== -1) gameState.turnOrder[idx] = fromId;
          else if (!gameState.turnOrder.includes(fromId)) gameState.turnOrder.push(fromId);
          if (gameState.guessResults && gameState.guessResults[pid]) {
            gameState.guessResults[fromId] = gameState.guessResults[pid];
            delete gameState.guessResults[pid];
          }
          if (connections[pid]) delete connections[pid];
          merged = true;
          break;
        }
      }
      if (!merged) {
        gameState.players[fromId] = { nick: data.nick, score: 0, online: true };
        if (gameState.status === 'playing' && !gameState.turnOrder.includes(fromId)) {
          gameState.turnOrder.push(fromId);
        }
      }
    }
    broadcast();
    return;
  }

  if (data.type === 'join') {
    let merged = false;
    for (const [pid, p] of Object.entries(gameState.players)) {
      if (pid !== fromId && p.nick === data.nick && p.online === false) {
        gameState.players[fromId] = { ...p, online: true };
        delete gameState.players[pid];
        const idx = gameState.turnOrder.indexOf(pid);
        if (idx !== -1) gameState.turnOrder[idx] = fromId;
        else if (!gameState.turnOrder.includes(fromId)) gameState.turnOrder.push(fromId);
        if (gameState.guessResults && gameState.guessResults[pid]) {
          gameState.guessResults[fromId] = gameState.guessResults[pid];
          delete gameState.guessResults[pid];
        }
        if (connections[pid]) delete connections[pid];
        merged = true;
        break;
      }
    }
    if (!merged) {
      gameState.players[fromId] = { nick: data.nick, score: 0, online: true };
      if (gameState.status === 'playing' && !gameState.turnOrder.includes(fromId)) {
        gameState.turnOrder.push(fromId);
      }
    }
    broadcast();
    return;
  }

  if (data.type === 'enc_submit') {
    if (gameState.phase !== 'encoding') return;
    const encoder = gameState.turnOrder[gameState.currentTurnIdx % gameState.turnOrder.length];
    if (fromId !== encoder) return;
    const { raw, methods, steps, keys } = data;
    let expectedResult = raw;
    let encOk = true;
    for (let i = 0; i < methods.length; i++) {
      const mId = methods[i];
      const key = keys ? keys[mId] : undefined;
      expectedResult = applyEnc(expectedResult, mId, key);
      if (expectedResult !== steps[i].result) { encOk = false; break; }
    }
    if (!encOk) {
      broadcast();
      const c = connections[fromId];
      if (c) c.send({ type: 'enc_invalid' });
      else showEncError('❌ 암호화 결과가 올바르지 않습니다. 다시 확인해주세요.');
      return;
    }
    gameState.currentRaw = raw;
    gameState.currentMethods = methods;
    gameState.currentEncSteps = steps;
    gameState.lastEncResult = data.finalResult;
    gameState.currentKeys = keys || {};
    gameState.clueSet = methods.length >= 2 ? [...methods].sort((a, b) => a - b) : [];
    gameState.guessResults = {};
    gameState.phase = 'guessing';
    gameState.turnTimerStart = Date.now();
    gameState.turnTimer = GUESS_TIME;
    broadcast();
    startHostTimer();
    return;
  }

  if (data.type === 'guess_submit') {
    if (gameState.phase !== 'guessing') return;
    if (gameState.guessResults[fromId]) return;
    const elapsed = Math.floor((Date.now() - gameState.turnTimerStart) / 1000);
    const timeLeft = Math.max(0, GUESS_TIME - elapsed);
    const encoder = gameState.turnOrder[gameState.currentTurnIdx % gameState.turnOrder.length];
    const isSingleMethod = gameState.currentMethods.length === 1;
    const orderOK = isSingleMethod ? true : JSON.stringify(data.methodOrder) === JSON.stringify(gameState.currentMethods);
    const answerOK = data.answer.trim().toLowerCase() === gameState.currentRaw.trim().toLowerCase();
    const success = orderOK && answerOK;

    if (success) {
      const pts = 10 + Math.floor(timeLeft * 0.04);
      gameState.guessResults[fromId] = { correct: true, points: pts };
      if (gameState.players[fromId]) gameState.players[fromId].score += pts;
      if (fromId === myId) showToast(`✅ 정답! +${pts}pt 획득!`, 'success');
      else { const c = connections[fromId]; if (c) c.send({ type: 'guess_result', correct: true, points: pts }); }
    } else {
      if (fromId === myId) {
        showGuessError('❌ 오답! 계속 시도할 수 있습니다.');
        const btn = document.getElementById('btn-guess-submit');
        if (btn) { btn.disabled = false; btn.textContent = '해독 완료 🛡'; }
      } else { const c = connections[fromId]; if (c) c.send({ type: 'guess_result', correct: false, points: 0 }); }
      broadcast();
      return;
    }

    const guessers = gameState.turnOrder.filter(id => id !== encoder && gameState.players[id]?.online !== false);
    const allDone = guessers.every(id => gameState.guessResults[id]);
    if (allDone) {
      gameState.phase = 'round_end';
      broadcast();
      setTimeout(() => nextTurn(), 5000);
    } else {
      broadcast();
    }
    return;
  }

  if (data.type === 'reaction') {
    Object.entries(connections).forEach(([id, c]) => { if (id !== fromId) c.send(data); });
    showFloatingReaction(data.emoji);
    return;
  }
}

function broadcast() {
  if (!isHost) return;
  const nextHost = gameState.turnOrder.find(function(pid) {
    return pid !== myId && gameState.players[pid] && gameState.players[pid].online !== false;
  });
  gameState.designatedNextHost = nextHost || null;
  const msg = { type: 'sync', state: gameState };
  Object.values(connections).forEach(c => c.send(msg));
  if (gameState.pendingToast) gameState.pendingToast = null;
  saveGameState();
  renderAll();
}

function send(data) {
  if (isHost) handleData(data, myId);
  else conn.send(data);
}

// ════════════════════════════════════════
//  SESSION RECOVERY
// ════════════════════════════════════════
const SESSION_KEY_HOST   = 'enc_game_session_host';
const SESSION_KEY_CLIENT = 'enc_game_session_client';
const GAMESTATE_KEY = 'enc_game_state';
const SESSION_TTL_MS = 30 * 60 * 1000;

function parseSession(raw) {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw);
    if (!s || typeof s !== 'object') return null;
    if (Number.isNaN(Number(s.ts))) return null;
    return s;
  } catch(e) { return null; }
}

function isSessionFresh(s) {
  return !!s && (Date.now() - Number(s.ts) <= SESSION_TTL_MS);
}

function getFreshSessions() {
  const hostParsed = parseSession(localStorage.getItem(SESSION_KEY_HOST));
  const clientParsed = parseSession(localStorage.getItem(SESSION_KEY_CLIENT));
  const host = isSessionFresh(hostParsed) ? hostParsed : null;
  const client = isSessionFresh(clientParsed) ? clientParsed : null;
  if (!host) { try { localStorage.removeItem(SESSION_KEY_HOST); } catch(e) {} }
  if (!client) { try { localStorage.removeItem(SESSION_KEY_CLIENT); } catch(e) {} }
  return { host, client };
}

function loadLatestSession() {
  const fresh = getFreshSessions();
  if (!fresh.host && !fresh.client) return null;
  if (fresh.host && !fresh.client) return fresh.host;
  if (!fresh.host && fresh.client) return fresh.client;
  return Number(fresh.host.ts) >= Number(fresh.client.ts) ? fresh.host : fresh.client;
}

function saveSession() {
  try {
    const data = JSON.stringify({ nick: myNick, roomId, peerId: myId, isHost, ts: Date.now() });
    if (isHost) {
      localStorage.setItem(SESSION_KEY_HOST, data);
      localStorage.removeItem(SESSION_KEY_CLIENT);
    } else {
      localStorage.setItem(SESSION_KEY_CLIENT, data);
      localStorage.removeItem(SESSION_KEY_HOST);
    }
  } catch(e) {}
}

function saveGameState() {
  try { localStorage.setItem(GAMESTATE_KEY, JSON.stringify(gameState)); } catch(e) {}
}

function loadGameState() {
  try {
    const raw = localStorage.getItem(GAMESTATE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch(e) { return null; }
}

function clearGameState() {
  try { localStorage.removeItem(GAMESTATE_KEY); } catch(e) {}
}

function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY_HOST);
    localStorage.removeItem(SESSION_KEY_CLIENT);
  } catch(e) {}
}

function loadSession() {
  try {
    const fresh = getFreshSessions();
    return (lobbyMode === 'host') ? (fresh.host || fresh.client) : (fresh.client || fresh.host);
  } catch(e) { return null; }
}

function doRecover() {
  const s = loadSession();
  if (!s) { dismissRecovery(); return; }
  myNick = s.nick;
  roomId = s.roomId;
  document.getElementById('user-nick').value = myNick;
  document.getElementById('room-id').value = roomId.replace(/^CGv4-/, '');
  document.getElementById('recovery-banner').style.display = 'none';
  switchTab('join');
  setLobbyStatus('재접속 시도 중...', '');
  joinAsClient(s.isHost ? null : s.peerId);
}

function dismissRecovery() {
  clearSession();
  document.getElementById('recovery-banner').style.display = 'none';
}

function showReconnectBanner() {
  const nextHostId = gameState.designatedNextHost;
  const gameStarted = gameState.status === 'playing';

  if (!gameStarted) {
    showToast('⏳ 호스트 연결이 끊겼습니다. 재접속을 기다립니다...', 'info');
    const _myIdBeforeDisconnect = myId;
    setTimeout(function() { joinAsClient(_myIdBeforeDisconnect); }, 2000);
    return;
  }

  if (nextHostId && myId === nextHostId) {
    promoteToHost();
  } else if (nextHostId) {
    showToast('🔄 호스트가 바뀌었습니다. 잠시 후 재접속합니다...', 'info');
    saveSession();
    clientRetries = 0;
    const _myIdAtDisconnect = myId;
    setTimeout(function() { joinAsClient(_myIdAtDisconnect); }, 3000);
  } else {
    showToast('🚫 호스트와 연결이 끊겼습니다. 방이 종료되었습니다.', 'error');
  }
}

function promoteToHost() {
  const oldHostId = roomId;
  const myOldPeerId = myId;

  const saved = loadGameState();
  if (saved && saved.players) {
    Object.assign(gameState, saved);
  }

  const prevHostData = (oldHostId && gameState.players[oldHostId])
    ? { ...gameState.players[oldHostId] } : null;
  if (prevHostData) {
    gameState.players[oldHostId] = { ...prevHostData, online: false };
  }

  const prevHostWasEncoder = gameState.status === 'playing' &&
    gameState.phase === 'encoding' &&
    gameState.turnOrder[gameState.currentTurnIdx % Math.max(gameState.turnOrder.length, 1)] === oldHostId;
  const oldNick = (prevHostData && prevHostData.nick) || '이전 호스트';

  const oldHostTurnIdx = gameState.turnOrder.indexOf(oldHostId);
  if (oldHostTurnIdx !== -1) gameState.turnOrder.splice(oldHostTurnIdx, 1);

  if (prevHostData && prevHostData.nick) {
    const preserveKey = '_prev_' + oldHostId;
    gameState.players[preserveKey] = { ...prevHostData, online: false };
    delete gameState.players[oldHostId];
  }

  if (myOldPeerId !== oldHostId && gameState.players[myOldPeerId]) {
    gameState.players[oldHostId] = { ...gameState.players[myOldPeerId], online: true };
    delete gameState.players[myOldPeerId];
    const tidx = gameState.turnOrder.indexOf(myOldPeerId);
    if (tidx !== -1) gameState.turnOrder[tidx] = oldHostId;
    else gameState.turnOrder.unshift(oldHostId);
    if (gameState.guessResults && gameState.guessResults[myOldPeerId]) {
      gameState.guessResults[oldHostId] = gameState.guessResults[myOldPeerId];
      delete gameState.guessResults[myOldPeerId];
    }
  } else if (gameState.players[oldHostId]) {
    gameState.players[oldHostId].online = true;
  } else {
    gameState.players[oldHostId] = { nick: myNick, score: 0, online: true };
  }

  const myNickSafe = (gameState.players[oldHostId] && gameState.players[oldHostId].nick) || '새 호스트';
  gameState.pendingToast = {
    msg: '👑 ' + myNickSafe + ' 님이 새 호스트가 되었습니다. (' + oldNick + ' 님 퇴장)',
    type: 'info'
  };

  isHost = true;
  roomId = oldHostId;
  myId = oldHostId;
  connections = {};
  saveSession();

  if (peer && !peer.destroyed) {
    try { peer.destroy(); } catch(e) {}
  }

  let promoteRetries = 0;
  function tryPromote() {
    peer = createPeer(oldHostId);
    peer.on('open', () => {
      myId = oldHostId;
      gameState.hostPeerId = oldHostId;
      saveSession();
      showToast('👑 호스트 역할을 인계받았습니다!', 'success');
      attachHostListeners();
      if (prevHostWasEncoder) {
        gameState.pendingToast = {
          msg: '🚪 ' + oldNick + ' 님(호스트)이 방을 나갔습니다. 다음 출제자로 넘어갑니다.',
          type: 'info'
        };
        nextTurn();
        return;
      }
      if (gameState.status === 'playing' && (gameState.phase === 'encoding' || gameState.phase === 'guessing')) {
        startHostTimer();
      }
      broadcast();
      renderAll();
    });
    peer.on('error', e => {
      logPeerError('promote-host', e);
      promoteRetries++;
      if (promoteRetries < 10) {
        const wait = Math.min(3000 + promoteRetries * 2000, 10000);
        showToast('호스트 ID 취득 중... (' + promoteRetries + '/10)', 'info');
        setTimeout(tryPromote, wait);
      } else {
        showToast('호스트 역할 인계 실패. 새로고침 후 다시 시도해주세요.', 'error');
        isHost = false;
        saveSession();
      }
    });
    peer.on('disconnected', () => {
      if (isHost && peer && !peer.destroyed) {
        try { peer.reconnect(); } catch(e) {}
      }
    });
  }
  tryPromote();
}

window.addEventListener('beforeunload', () => {
  if (myId && roomId) saveSession();
  if (peer && !peer.destroyed) {
    try { peer.destroy(); } catch(e) {}
  }
});
