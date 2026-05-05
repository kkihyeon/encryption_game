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
  if (data.type === 'join') {
    gameState.players[fromId] = { nick: data.nick, score: 0, online: true };
    if (gameState.status === 'playing' && !gameState.turnOrder.includes(fromId)) {
      gameState.turnOrder.push(fromId);
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
  const msg = { type: 'sync', state: gameState };
  Object.values(connections).forEach(c => c.send(msg));
  if (gameState.pendingToast) gameState.pendingToast = null;
  renderAll();
}

function send(data) {
  if (isHost) handleData(data, myId);
  else conn.send(data);
}
