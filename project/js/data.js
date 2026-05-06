// ════════════════════════════════════════
//  DATA HANDLING
//  P2P 메시지 수신 처리 및 상태 동기화 (공통)
// ════════════════════════════════════════

// 수신 메시지 라우팅: sync(공통) → 클라이언트 전용 → 호스트 전용 순서로 처리
function handleData(data, fromId) {

  // 공통: 호스트 → 클라이언트 상태 동기화 (매 1초 broadcast)
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

  // 클라이언트 전용: 닉네임 중복 거부 / 입장 승인 / 암호화 검증 실패 / 해독 결과 / 리액션 수신
  if (!isHost) {
    if (data.type === 'nick_taken') {
      disconnectExpected = true;
      setLobbyStatus('닉네임이 중복됩니다. 다른 닉네임을 사용하세요.', 'error');
      if (conn) { try { conn.close(); } catch(e) {} conn = null; }
      return;
    }
    if (data.type === 'join_ok') {
      showGameUI();
      return;
    }
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

  // 인게임(호스트): 새 플레이어 접속 — 닉네임 중복 확인 후 players·turnOrder에 추가
  if (data.type === 'join') {
    const nickTaken = Object.values(gameState.players).some(p => p.nick === data.nick && p.online !== false);
    if (nickTaken) {
      const c = connections[fromId];
      if (c) c.send({ type: 'nick_taken' });
      return;
    }
    gameState.players[fromId] = { nick: data.nick, score: 0, online: true };
    if (gameState.status === 'playing' && !gameState.turnOrder.includes(fromId)) {
      gameState.turnOrder.push(fromId);
    }
    const c = connections[fromId];
    if (c) c.send({ type: 'join_ok' });
    broadcast();
    return;
  }

  // 인게임(호스트): 출제자가 암호화 결과 제출 — 서버에서 재검증 후 해독 단계로 전환
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
    // clueSet: 방식 ID를 오름차순 정렬하여 힌트로 공개 (암호화 순서는 숨김, 1개여도 선택 필요)
    gameState.clueSet = [...methods].sort((a, b) => a - b);
    gameState.guessResults = {};
    gameState.phase = 'guessing';
    gameState.turnTimerStart = Date.now();
    gameState.turnTimer = GUESS_TIME;
    broadcast();
    startHostTimer();
    return;
  }

  // 인게임(호스트): 해독자가 답 제출 — 정답·순서 검증 후 점수 부여
  if (data.type === 'guess_submit') {
    if (gameState.phase !== 'guessing') return;
    if (gameState.guessResults[fromId]) return; // 중복 제출 방지
    const encoder = gameState.turnOrder[gameState.currentTurnIdx % gameState.turnOrder.length];
    const orderOK = JSON.stringify(data.methodOrder) === JSON.stringify(gameState.currentMethods);
    const answerOK = data.answer.trim().toLowerCase() === gameState.currentRaw.trim().toLowerCase();
    const success = orderOK && answerOK;

    if (success) {
      const correctCount = Object.values(gameState.guessResults).filter(r => r.correct).length;
      const pts = Math.max(1, 10 - correctCount); // 1등 10pt, 2등 9pt, 3등 8pt ...
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

    // 모든 해독자가 제출했으면 round_end로 전환 (5초 후 다음 턴)
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

  // 인게임(호스트): 리액션 이모지 — 발신자 제외 전체 중계
  if (data.type === 'reaction') {
    Object.entries(connections).forEach(([id, c]) => { if (id !== fromId) c.send(data); });
    showFloatingReaction(data.emoji);
    return;
  }
}

// 호스트 → 전체 클라이언트에 gameState를 sync 메시지로 전송 후 자신도 renderAll
function broadcast() {
  if (!isHost) return;
  const msg = { type: 'sync', state: gameState };
  Object.values(connections).forEach(c => c.send(msg));
  if (gameState.pendingToast) gameState.pendingToast = null;
  renderAll();
}

// 공통: 호스트면 handleData 직접 호출, 클라이언트면 conn.send
function send(data) {
  if (isHost) handleData(data, myId);
  else conn.send(data);
}
