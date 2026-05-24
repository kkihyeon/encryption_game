// ════════════════════════════════════════
//  CLIENT TIMER
//  인게임: 클라이언트가 로컬에서 독립적으로 타이머 진행 (sync 전송 지연 보정)
// ════════════════════════════════════════
function startClientTimer() {
  if (clientTimerInterval) clearInterval(clientTimerInterval);
  if (isHost) return;
  clientTimerInterval = setInterval(() => {
    if (!gameState.turnTimerStart || gameState.status !== 'playing') return;
    const limit = gameState.phase === 'encoding' ? ENC_TIME : GUESS_TIME;
    const elapsed = Math.floor((Date.now() - gameState.turnTimerStart) / 1000);
    const left = Math.max(0, limit - elapsed);
    const timerEl = document.getElementById('timer-display');
    if (!timerEl) return;
    const min = Math.floor(left/60).toString().padStart(2,'0');
    const sec = (left%60).toString().padStart(2,'0');
    timerEl.textContent = `${min}:${sec}`;
    timerEl.classList.toggle('timer-urgent', left <= 15);
  }, 250);
}

// ════════════════════════════════════════
//  GUIDE
//  가이드 오버레이 열기/닫기 및 탭 전환
// ════════════════════════════════════════
function openGuide() {
  document.getElementById('guide-overlay').classList.add('visible');
  switchGuideTab('game');
}
function closeGuide() {
  document.getElementById('guide-overlay').classList.remove('visible');
}
function switchGuideTab(tab) {
  ['game','cipher'].forEach(t => {
    document.getElementById(`gtab-${t}`).classList.toggle('active', t===tab);
    document.getElementById(`gpanel-${t}`).classList.toggle('active', t===tab);
  });
}

// ════════════════════════════════════════
//  RENDER
//  인게임: UI 전체 갱신 및 각 영역별 렌더 함수
// ════════════════════════════════════════

// XSS 방지: 사용자 입력 문자열을 innerHTML에 삽입하기 전 이스케이프
function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 로비 → 인게임 전환: 로비 숨기고 game-ui 표시, 캔버스·방식 셀렉터 초기화
function showGameUI() {
  document.getElementById('lobby').style.display = 'none';
  const ui = document.getElementById('game-ui');
  ui.style.display = 'flex';
  initCanvas();
  resizeCanvas();
  initMethodSelector();
  if (isHost) document.getElementById('host-start-btn').style.display = '';
  renderAll();
}

// 인게임: 헤더·플레이어·순위·중앙·액션 전체 동기화 (sync 수신 또는 상태 변경 시마다 호출)
function renderAll() {
  renderHeader();
  renderPlayerList();
  renderRankList();
  renderCenter();
  renderActionArea();
  if (gameState.status==='finished') showGameOver();
}

// 인게임 헤더: 페이즈명·타이머·라운드·내 역할 뱃지 표시
function renderHeader() {
  const phases = { encoding:'출제 단계', guessing:'해독 단계', round_end:'라운드 종료', idle:'대기 중' };
  document.getElementById('phase-label').textContent = phases[gameState.phase]||'대기 중';

  const timerEl = document.getElementById('timer-display');
  if (isHost || !clientTimerInterval) {
    const left = gameState.status === 'playing' && gameState.turnTimerStart
      ? Math.max(0, (gameState.phase === 'encoding' ? ENC_TIME : GUESS_TIME) -
          Math.floor((Date.now() - gameState.turnTimerStart) / 1000))
      : (gameState.turnTimer || 0);
    const min = Math.floor(left/60).toString().padStart(2,'0');
    const sec = (left%60).toString().padStart(2,'0');
    timerEl.textContent = gameState.status==='playing' ? `${min}:${sec}` : '--:--';
    timerEl.classList.toggle('timer-urgent', left<=15 && gameState.status==='playing');
  }

  document.getElementById('round-info').textContent =
    gameState.status==='playing' ? `${gameState.currentRound} / ${gameState.totalRounds}` : `0 / ${gameState.totalRounds || 0}`;

  const me = gameState.players[myId];
  if (me) {
    const b = document.getElementById('my-role-badge');
    b.style.display = '';
    const encoder = gameState.turnOrder[gameState.currentTurnIdx % Math.max(gameState.turnOrder.length,1)];
    const isEncoder = myId===encoder && gameState.phase==='encoding';
    const isGuesser = myId!==encoder && gameState.phase==='guessing';
    b.textContent = isEncoder ? '⚔ 출제자' : isGuesser ? '🔍 해독자' : me.nick;
  }
}

// 인게임 사이드: 참가자 카드 목록 (턴 순서대로, 역할·점수·제출 상태 표시)
function renderPlayerList() {
  const list = document.getElementById('player-list');
  list.innerHTML = '';
  const encoder = gameState.turnOrder[gameState.currentTurnIdx % Math.max(gameState.turnOrder.length,1)];

  const allPlayers = Object.entries(gameState.players).filter(([,p])=>p && p.online!==false);
  const displayOrder = gameState.turnOrder.length>0
    ? [...gameState.turnOrder.map(id => [id, gameState.players[id]]).filter(([,p])=>p && p.online!==false),
       ...allPlayers.filter(([id])=>!gameState.turnOrder.includes(id))]
    : allPlayers;

  displayOrder.forEach(([id, p]) => {
    if (!p) return;
    const isEncoder = id===encoder && gameState.phase==='encoding';
    const isGuesser = id!==encoder && (gameState.phase==='guessing' || gameState.phase==='round_end');
    const alreadyGuessed = gameState.guessResults && gameState.guessResults[id];
    const isMe = id===myId;

    const card = document.createElement('div');
    card.className = 'player-card';
    if (isEncoder) card.classList.add('current-turn');

    const initials = escHtml(p.nick.slice(0,2).toUpperCase());
    const avClass = isEncoder ? 'is-turn' : (isGuesser && !alreadyGuessed ? 'is-guessing' : '');

    let badge = '';
    if (isEncoder) badge = `<div class="player-turn-badge" style="background:rgba(255,60,60,0.18);color:#ff6060;border-color:rgba(255,60,60,0.4)">⚔ 암호화 중</div>`;
    else if (isGuesser && !alreadyGuessed) badge = `<div class="player-turn-badge guessing">🔍 복호화 중</div>`;
    else if (isGuesser && alreadyGuessed) {
      const res = gameState.guessResults[id];
      badge = res?.correct
        ? `<div class="player-turn-badge" style="background:rgba(34,197,94,0.15);color:#15803d;border-color:rgba(34,197,94,0.3)">✓ 성공</div>`
        : `<div class="player-turn-badge" style="background:rgba(255,90,90,0.15);color:#ff8080;border-color:rgba(255,90,90,0.3)">✗ 실패</div>`;
    }

    card.innerHTML = `
      <div class="player-avatar ${avClass}">${initials}</div>
      <div class="player-info-block">
        <div class="player-name">${escHtml(p.nick)}${isMe?`<span class="my-badge" style="font-size:16px;padding:1px 6px">나</span>`:''}</div>
        <div class="player-score-line">${p.score}pt</div>
      </div>
      ${badge}
    `;
    list.appendChild(card);
  });

  // 플레이어가 1명이면 빈 슬롯 표시 (최소 2명 슬롯 보장)
  const shown = displayOrder.length;
  for (let i=shown; i<Math.max(shown,2); i++) {
    const g = document.createElement('div');
    g.className = 'player-card ghost';
    g.innerHTML = '<div class="player-avatar">?</div><div class="player-info-block"><div class="player-name">대기 중</div><div class="player-score-line">—</div></div>';
    list.appendChild(g);
  }
}

// 인게임 사이드: 점수 순위 목록 (상위 3위 메달 색상)
function renderRankList() {
  const sorted = Object.entries(gameState.players).filter(([,p])=>p && p.online!==false).sort(([,a],[,b])=>b.score-a.score);
  const el = document.getElementById('rank-list');
  el.innerHTML = '';
  sorted.forEach(([id,p],i) => {
    const nc = i===0?'gold':i===1?'silver':i===2?'bronze':'';
    const item = document.createElement('div');
    item.className = 'rank-item';
    const initials = escHtml(p.nick.slice(0,2).toUpperCase());
    item.innerHTML = `
      <div class="rank-num ${nc}">${i+1}</div>
      <div class="player-avatar" style="width:26px;height:26px;font-size:17px">${initials}</div>
      <div style="flex:1;font-size:19px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text)">${escHtml(p.nick)}</div>
      <div style="font-family:'Pretendard',sans-serif;font-size:18px;color:var(--text3)">${p.score}</div>
    `;
    el.appendChild(item);
  });
}

// 인게임 중앙: 페이즈 배너 + 암호문 + 힌트 칩 표시
// - encoding: 출제 중 안내
// - guessing: 암호문·힌트 공개 (1방식=키값, 2방식=방식명+키값)
// - round_end: 평문·암호문 공개 및 정답자·출제자에게만 키값 공개
function renderCenter() {
  const banner = document.getElementById('center-phase-banner');
  const cBox = document.getElementById('cipher-box-main');
  const cText = document.getElementById('cipher-text-main');
  const cLabel = document.getElementById('cipher-label-main');
  const hints = document.getElementById('method-hints-area');
  hints.innerHTML = '';

  if (gameState.status==='lobby') {
    banner.className = 'phase-banner waiting';
    banner.textContent = `STANDBY — ${gameState.totalRounds || 0}라운드 게임 | 플레이어 접속 대기 중`;
    cText.textContent = '<약속>사전에 존재하는 단어나 이해가 가능한 문장을 사용하기';
    cText.className = 'cipher-text muted';
    cBox.className = 'cipher-box';
    cLabel.textContent = 'MEMO BOARD';
    return;
  }

  const encoder = gameState.turnOrder[gameState.currentTurnIdx % Math.max(gameState.turnOrder.length,1)];
  const encoderName = gameState.players[encoder]?.nick || '출제자';

  if (gameState.phase==='encoding') {
    banner.className = 'phase-banner encoding';
    banner.textContent = `⚔ 출제 단계 — ${encoderName}님이 암호화 중`;
    cText.textContent = '출제자가 암호문을 만들고 있습니다...';
    cText.className = 'cipher-text muted';
    cBox.className = 'cipher-box';
    cLabel.textContent = 'ENCODING IN PROGRESS';
  } else if (gameState.phase==='guessing') {
    banner.className = 'phase-banner guessing';
    banner.textContent = `🔍 해독 단계 — 암호문을 복호화해보세요!`;
    cText.textContent = gameState.lastEncResult || '...';
    cText.className = 'cipher-text';
    cBox.className = 'cipher-box active';
    cLabel.textContent = 'ENCRYPTED MESSAGE';
    const _keys = gameState.currentKeys || {};
    const _keyLabels = { 1: '순열', 2: '단위', 3: '시프트', 4: '레일' };
    if (gameState.currentMethods.length === 1) {
      // 방식 1개: 키값만 힌트로 표시
      const mId = gameState.currentMethods[0];
      const keyVal = (_keys[mId] !== undefined && _keys[mId] !== null) ? _keys[mId] : '?';
      const chip = document.createElement('div');
      chip.className = 'hint-chip';
      chip.textContent = `키: ${keyVal}`;
      hints.appendChild(chip);
    } else {
      // 방식 2개: clueSet(정렬된 ID)으로 방식명+키값 힌트 표시 (순서 비공개)
      gameState.clueSet.forEach(mId => {
        const m = METHODS[mId];
        const keyVal = (_keys[mId] !== undefined && _keys[mId] !== null) ? _keys[mId] : '?';
        const lbl = _keyLabels[mId] || 'KEY';
        const chip = document.createElement('div');
        chip.className = 'hint-chip';
        chip.textContent = `${m.name} ${lbl}: ${keyVal}`;
        hints.appendChild(chip);
      });
    }
  } else if (gameState.phase==='round_end') {
    banner.className = 'phase-banner roundend';
    banner.textContent = '✓ 라운드 종료 — 다음 차례로 넘어갑니다';
    let resultText = gameState.currentRaw || '';
    if (gameState.currentRaw && !gameState.currentRaw.startsWith('⏰')) {
      if (gameState.currentEncSteps && gameState.currentEncSteps.length >= 2) {
        resultText = `최종: "${gameState.lastEncResult || '?'}" ← 1차: "${gameState.currentEncSteps[0].result}" ← 평문: "${gameState.currentRaw}"`;
      } else {
        resultText = `암호: "${gameState.lastEncResult || '?'}" → 평문: "${gameState.currentRaw}"`;
      }
    }
    cText.textContent = resultText;
    cText.className = 'cipher-text';
    cBox.className = 'cipher-box active';
    cLabel.textContent = '회차 결과';
    // 정답자 또는 출제자에게만 키값 공개
    const myResult = gameState.guessResults[myId];
    const iAmEncoder = myId === gameState.turnOrder[gameState.currentTurnIdx % Math.max(gameState.turnOrder.length,1)];
    if ((myResult?.correct || iAmEncoder) && gameState.currentKeys && Object.keys(gameState.currentKeys).length > 0) {
      const keyChip = document.createElement('div');
      keyChip.className = 'hint-chip';
      keyChip.style.cssText = `background:rgba(124,200,255,0.1);border:1.5px solid var(--accent2);color:var(--accent2)`;
      const keyDesc = gameState.currentMethods.map(mId => {
        const kv = gameState.currentKeys[mId];
        return kv !== undefined ? `${METHODS[mId].name}: 키=${kv}` : METHODS[mId].name;
      }).join(' → ');
      keyChip.textContent = `🔑 ${keyDesc}`;
      hints.appendChild(keyChip);
    }
  }
}

// 인게임 액션 영역: 페이즈·역할에 따라 암호화 UI / 복호화 UI / 대기 UI 토글
function renderActionArea() {
  const encUI = document.getElementById('enc-ui');
  const guessUI = document.getElementById('guess-ui');
  const waitUI = document.getElementById('wait-ui');

  encUI.classList.remove('visible');
  guessUI.classList.remove('visible');
  waitUI.classList.remove('visible');

  if (gameState.status==='lobby') {
    waitUI.classList.add('visible');
    document.getElementById('wait-text').textContent = isHost
      ? '방 코드를 공유하고 플레이어가 접속하면 게임을 시작하세요.'
      : '⏳ 호스트가 게임을 시작하기를 기다리는 중입니다...';
    return;
  }
  if (gameState.status!=='playing') return;

  const encoder = gameState.turnOrder[gameState.currentTurnIdx % Math.max(gameState.turnOrder.length,1)];
  const iAmEncoder = myId===encoder;

  if (gameState.phase==='encoding') {
    if (iAmEncoder) {
      encUI.classList.add('visible');
      mgHide();
    } else {
      waitUI.classList.add('visible');
      document.getElementById('wait-text').textContent = `⏳ ${gameState.players[encoder]?.nick||'출제자'}님이 암호화 문제를 만들고 있습니다. 잠시 기다려주세요!`;
      mgShow();
    }
  } else if (gameState.phase==='guessing') {
    if (!iAmEncoder) {
      const alreadySubmitted = gameState.guessResults && gameState.guessResults[myId];
      if (alreadySubmitted) {
        waitUI.classList.add('visible');
        const res = gameState.guessResults[myId];
        document.getElementById('wait-text').textContent = res.correct
          ? `✅ 정답! +${res.points}점 획득! 다른 플레이어를 기다리는 중...`
          : `❌ 오답. 다른 플레이어를 기다리는 중...`;
        mgHide();
      } else {
        guessUI.classList.add('visible');
        renderGuessUI();
        const btn = document.getElementById('btn-guess-submit');
        btn.disabled = false;
        btn.textContent = '복호화 완료 🛡';
        mgHide();
      }
    } else {
      waitUI.classList.add('visible');
      const submitted = Object.keys(gameState.guessResults||{}).filter(k=>k!=='_encoder_bonus').length;
      const total = gameState.turnOrder.filter(id=>id!==encoder && gameState.players[id]?.online!==false).length;
      document.getElementById('wait-text').textContent = `⏳ 플레이어들이 복호화 중입니다... (${submitted}/${total} 제출)`;
      mgShow();
    }
  } else if (gameState.phase==='round_end') {
    waitUI.classList.add('visible');
    document.getElementById('wait-text').textContent = '다음 차례로 넘어갑니다...';
    mgHide();
  }
}

// ════════════════════════════════════════
//  GAME OVER
//  게임 종료 화면: 우승자 및 최종 순위 렌더
// ════════════════════════════════════════
function showGameOver() {
  const el = document.getElementById('game-over');
  el.style.display = 'flex';

  const sorted = Object.entries(gameState.players).filter(([,p])=>p && p.online!==false).sort(([,a],[,b])=>b.score-a.score);
  const winner = sorted[0];
  const goWin = document.getElementById('go-winner');
  goWin.textContent = winner ? `🏆 ${winner[1].nick} 우승!` : '게임 종료';
  goWin.style.color = 'var(--gold)';

  const rl = document.getElementById('go-rank-list');
  rl.innerHTML = '';
  const medals = ['🥇','🥈','🥉'];
  sorted.forEach(([id,p],i) => {
    const div = document.createElement('div');
    div.className = 'go-rank-item';
    const initials = escHtml(p.nick.slice(0,2).toUpperCase());
    div.innerHTML = `
      <span style="font-size:26px">${medals[i]||`${i+1}.`}</span>
      <div class="player-avatar" style="width:32px;height:32px;font-size:19px">${initials}</div>
      <span style="flex:1;font-size:21px;font-weight:700;color:var(--text)">${escHtml(p.nick)}</span>
      <span style="font-family:'Pretendard',sans-serif;font-size:21px;color:var(--gold)">${p.score}pt</span>
    `;
    rl.appendChild(div);
  });
}

// ════════════════════════════════════════
//  TOAST / ERROR
//  인게임: 에러 메시지 및 토스트 알림 표시
// ════════════════════════════════════════

// 인게임(암호화 UI): 암호화 오류 메시지 (5초 후 자동 숨김)
function showEncError(msg) {
  const el = document.getElementById('enc-error-msg');
  el.textContent = msg;
  el.style.display = 'block';
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.style.display = 'none'; }, 5000);
}

// 인게임(복호화 UI): 오답 오류 메시지 (5초 후 자동 숨김)
function showGuessError(msg) {
  const el = document.getElementById('guess-error-msg');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.style.display = 'none'; }, 5000);
}

// 공통: 화면 하단 토스트 알림 (2.8초 후 자동 제거)
function showToast(msg, type='info') {
  const old = document.querySelector('.toast');
  if (old) old.remove();
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}
