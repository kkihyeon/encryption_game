// ════════════════════════════════════════
//  GAME FLOW
// ════════════════════════════════════════
function hostStartGame() {
  if (!isHost) return;
  const online = Object.entries(gameState.players).filter(([,p]) => p.online!==false);
  if (online.length < 2) { showToast('최소 2명이 필요합니다', 'error'); return; }
  if (online.length > 6) { showToast('최대 6명까지 가능합니다', 'error'); return; }

  const order = online.map(([id]) => id);
  for (let i = order.length-1; i>0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [order[i],order[j]] = [order[j],order[i]];
  }

  gameState.turnOrder = order;
  gameState.currentTurnIdx = 0;
  gameState.currentRound = 1;
  gameState.status = 'playing';
  gameState.phase = 'encoding';
  gameState.turnTimerStart = Date.now();
  gameState.turnTimer = ENC_TIME;
  gameState.guessResults = {};
  document.getElementById('host-start-btn').style.display = 'none';
  resetLocalState();
  broadcast();
  startHostTimer();
  showToast('게임 시작!', 'success');
}

function startHostTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (!isHost) return;
    const elapsed = Math.floor((Date.now() - gameState.turnTimerStart) / 1000);
    const limit = gameState.phase === 'encoding' ? ENC_TIME : GUESS_TIME;
    const left = Math.max(0, limit - elapsed);
    gameState.turnTimer = left;
    if (left <= 0) {
      clearInterval(timerInterval);
      if (gameState.phase === 'encoding') {
        gameState.currentRaw = '⏰ 출제 시간 초과';
        gameState.phase = 'round_end';
        broadcast();
        setTimeout(() => nextTurn(), 5000);
      } else if (gameState.phase === 'guessing') {
        const encoder = gameState.turnOrder[gameState.currentTurnIdx % gameState.turnOrder.length];
        const guessers = gameState.turnOrder.filter(id => id !== encoder && gameState.players[id]?.online!==false);
        guessers.forEach(id => {
          if (!gameState.guessResults[id]) {
            gameState.guessResults[id] = { correct: false, points: 0 };
          }
        });
        gameState.phase = 'round_end';
        broadcast();
        setTimeout(() => nextTurn(), 5000);
      }
    } else {
      broadcast();
    }
  }, 1000);
}

function nextTurn() {
  if (!isHost) return;
  gameState.currentTurnIdx++;
  const numPlayers = gameState.turnOrder.length;
  const totalTurns = gameState.totalRounds * numPlayers;

  if (gameState.currentTurnIdx >= totalTurns) {
    gameState.status = 'finished';
    gameState.phase = 'idle';
    broadcast();
    clearInterval(timerInterval);
    return;
  }

  gameState.currentRound = Math.floor(gameState.currentTurnIdx / numPlayers) + 1;
  gameState.currentRaw = '';
  gameState.currentMethods = [];
  gameState.currentEncSteps = [];
  gameState.currentKeys = {};
  gameState.lastEncResult = '';
  gameState.clueSet = [];
  gameState.guessResults = {};
  gameState.phase = 'encoding';
  gameState.turnTimerStart = Date.now();
  gameState.turnTimer = ENC_TIME;
  resetLocalState();
  broadcast();
  startHostTimer();
}

function resetLocalState() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  document.getElementById('memo-area').value = '';
  document.getElementById('raw-input').value = '';
  document.getElementById('enc-input-1').value = '';
  document.getElementById('enc-input-2').value = '';
  delete document.getElementById('enc-input-1').dataset.manual;
  delete document.getElementById('enc-input-2').dataset.manual;
  const ki0 = document.getElementById('key-input-0');
  const ki1 = document.getElementById('key-input-1');
  if (ki0) ki0.remove();
  if (ki1) ki1.remove();
  encStepMethods = [];
  renderEncSteps();
  checkEncReady();
  document.getElementById('guess-answer').value = '';
  guessMethodOrder = [];
  guessUIBuiltForTurn = -1;
  setBoardMode('draw');
  const encErr = document.getElementById('enc-error-msg');
  if (encErr) { encErr.style.display='none'; clearTimeout(encErr._timer); }
  const guessErr = document.getElementById('guess-error-msg');
  if (guessErr) { guessErr.style.display='none'; clearTimeout(guessErr._timer); }
}

// ════════════════════════════════════════
//  ENCODING SUBMIT
// ════════════════════════════════════════
let encStepMethods = [];

function initMethodSelector() {
  const el = document.getElementById('method-selector');
  el.innerHTML = '';
  [1,2,3,4].forEach(id => {
    const m = METHODS[id];
    const btn = document.createElement('button');
    btn.className = `method-btn m${id}`;
    btn.dataset.id = id;
    btn.textContent = m.name;
    btn.onclick = () => addEncStep(id);
    el.appendChild(btn);
  });
}

function addEncStep(methodId) {
  if (encStepMethods.includes(methodId)) {
    removeEncStep(encStepMethods.indexOf(methodId));
    return;
  }
  if (encStepMethods.length >= 2) { showToast('최대 2단계까지 가능합니다', 'error'); return; }
  encStepMethods.push(methodId);
  renderEncSteps();
  updateMethodBtnSelected();
  checkEncReady();
}

function removeEncStep(idx) {
  encStepMethods.splice(idx, 1);
  const ki = document.getElementById(`key-input-${idx}`);
  if (ki) ki.remove();
  if (idx === 0) {
    const ki1 = document.getElementById('key-input-1');
    if (ki1) ki1.remove();
  }
  renderEncSteps();
  updateMethodBtnSelected();
  checkEncReady();
}

function updateMethodBtnSelected() {
  document.querySelectorAll('.method-btn').forEach(btn => {
    const id = parseInt(btn.dataset.id);
    btn.classList.toggle('selected', encStepMethods.includes(id));
  });
}

function renderEncSteps() {
  const s1 = document.getElementById('step1-row');
  const s2 = document.getElementById('step2-row');
  s1.style.display = encStepMethods.length >= 1 ? 'flex' : 'none';
  s2.style.display = encStepMethods.length >= 2 ? 'flex' : 'none';
  if (encStepMethods[0]) {
    const m = METHODS[encStepMethods[0]];
    document.getElementById('step1-method-name').textContent = `1단계 ${m.name}`;
    document.getElementById('enc-input-1').placeholder = `${m.name} 암호화 결과`;
    renderKeyInput(0, encStepMethods[0]);
  }
  if (encStepMethods[1]) {
    const m = METHODS[encStepMethods[1]];
    document.getElementById('step2-method-name').textContent = `2단계 ${m.name}`;
    document.getElementById('enc-input-2').placeholder = `${m.name} 암호화 결과`;
    renderKeyInput(1, encStepMethods[1]);
  }
}

function renderKeyInput(stepIdx, methodId) {
  const rowId = stepIdx === 0 ? 'step1-row' : 'step2-row';
  const keyInputId = `key-input-${stepIdx}`;
  const row = document.getElementById(rowId);
  const old = document.getElementById(keyInputId);
  if (old && parseInt(old.dataset.methodId) === methodId) return;
  if (old) old.remove();
  const keyInput = document.createElement('input');
  keyInput.className = 'enc-input';
  keyInput.id = keyInputId;
  keyInput.dataset.methodId = methodId;
  keyInput.style.cssText = 'width:90px;flex:none;';
  keyInput.type = 'text';
  keyInput.inputMode = 'text';
  if (methodId === 1) { keyInput.placeholder = '예: 312'; keyInput.value = '21'; keyInput.maxLength = 9; }
  else if (methodId === 2) { keyInput.placeholder = '단위'; keyInput.value = '3'; keyInput.maxLength = 3; keyInput.inputMode = 'numeric'; }
  else if (methodId === 3) { keyInput.placeholder = '시프트'; keyInput.value = '3'; keyInput.maxLength = 2; keyInput.inputMode = 'numeric'; }
  else if (methodId === 4) { keyInput.placeholder = '레일'; keyInput.value = '3'; keyInput.maxLength = 2; keyInput.inputMode = 'numeric'; }
  else { return; }
  keyInput.oninput = () => { checkEncReady(); };
  const encInput = document.getElementById(`enc-input-${stepIdx+1}`);
  row.insertBefore(keyInput, encInput);
}

function getEncKey(stepIdx) {
  const ki = document.getElementById(`key-input-${stepIdx}`);
  if (!ki) return undefined;
  const val = ki.value.trim();
  if (!val) return undefined;
  const mId = encStepMethods[stepIdx];
  if (mId === 1) return val;
  const n = parseInt(val, 10);
  return isNaN(n) ? undefined : n;
}

function autoFillEnc() {
  const raw = document.getElementById('raw-input').value;
  if (!raw || !encStepMethods[0]) return;
  const k0 = getEncKey(0);
  const r1 = applyEnc(raw, encStepMethods[0], k0);
  const el1 = document.getElementById('enc-input-1');
  if (!el1.dataset.manual) el1.value = r1;
  if (encStepMethods[1]) {
    const k1 = getEncKey(1);
    const r2 = applyEnc(el1.value || r1, encStepMethods[1], k1);
    const el2 = document.getElementById('enc-input-2');
    if (!el2.dataset.manual) el2.value = r2;
  }
  checkEncReady();
}

function onRawInput() { checkEncReady(); }
function onEncInput() { checkEncReady(); }

document.getElementById('enc-input-1').oninput = function() { this.dataset.manual='1'; checkEncReady(); };
document.getElementById('enc-input-2').oninput = function() { this.dataset.manual='1'; checkEncReady(); };

function checkEncReady() {
  const raw = document.getElementById('raw-input').value.trim();
  const s1ok = encStepMethods.length===0 || document.getElementById('enc-input-1').value.trim();
  const s2ok = encStepMethods.length<=1 || document.getElementById('enc-input-2').value.trim();
  const ready = raw && encStepMethods.length>0 && s1ok && s2ok;
  document.getElementById('btn-enc-submit').disabled = !ready;
}

function submitEncoding() {
  const raw = document.getElementById('raw-input').value.trim();
  if (!raw || encStepMethods.length===0) return;
  const steps = [];
  const keys = {};
  if (encStepMethods[0]) {
    steps.push({ methodId: encStepMethods[0], result: document.getElementById('enc-input-1').value.trim() });
    const k0 = getEncKey(0);
    if (k0 !== undefined) keys[encStepMethods[0]] = k0;
  }
  if (encStepMethods[1]) {
    steps.push({ methodId: encStepMethods[1], result: document.getElementById('enc-input-2').value.trim() });
    const k1 = getEncKey(1);
    if (k1 !== undefined) keys[encStepMethods[1]] = k1;
  }
  const finalResult = steps[steps.length-1].result;
  send({ type: 'enc_submit', raw, methods: [...encStepMethods], steps, finalResult, keys });
  document.getElementById('raw-input').value = '';
  document.getElementById('enc-input-1').value = '';
  document.getElementById('enc-input-2').value = '';
  delete document.getElementById('enc-input-1').dataset.manual;
  delete document.getElementById('enc-input-2').dataset.manual;
  const ki0 = document.getElementById('key-input-0');
  const ki1 = document.getElementById('key-input-1');
  if (ki0) ki0.remove();
  if (ki1) ki1.remove();
  encStepMethods = [];
  renderEncSteps();
  checkEncReady();
}

// ════════════════════════════════════════
//  GUESSING SUBMIT
// ════════════════════════════════════════
let guessMethodOrder = [];
let guessUIBuiltForTurn = -1;

function renderGuessUI() {
  const steps = document.getElementById('guess-steps');
  if (guessUIBuiltForTurn === gameState.currentTurnIdx && steps.childElementCount > 0) return;
  guessUIBuiltForTurn = gameState.currentTurnIdx;
  steps.innerHTML = '';

  const isSingle = gameState.currentMethods.length === 1;
  const label = document.getElementById('guess-ui-label');
  if (label) label.textContent = isSingle ? '원본 메시지 입력' : '복호화 순서 추측 및 원본 입력';
  const num = gameState.clueSet.length;
  guessMethodOrder = [];
  if (!isSingle) {
    guessMethodOrder = new Array(num).fill(null);
    for (let i=0; i<num; i++) {
      const div = document.createElement('div');
      div.className = 'guess-step';
      const sn = document.createElement('div');
      sn.className = 'step-num'; sn.textContent = i+1;
      const row = document.createElement('div');
      row.className = 'guess-method-row';
      gameState.clueSet.forEach(mId => {
        const m = METHODS[mId];
        const btn = document.createElement('button');
        btn.className = `guess-m-btn m${mId}`;
        btn.dataset.mid = mId; btn.dataset.step = i;
        btn.textContent = m.name;
        btn.onclick = () => {
          document.querySelectorAll(`.guess-m-btn[data-step="${i}"]`).forEach(b => b.classList.remove('sel'));
          btn.classList.add('sel');
          guessMethodOrder[i] = mId;
        };
        row.appendChild(btn);
      });
      div.appendChild(sn); div.appendChild(row);
      steps.appendChild(div);
    }
  }
}

function submitGuess() {
  const answer = document.getElementById('guess-answer').value.trim();
  if (!answer) { showToast('원본 메시지를 입력하세요', 'error'); return; }
  const isSingle = gameState.currentMethods.length === 1;
  if (!isSingle && guessMethodOrder.some(v => v===null)) { showToast('모든 단계의 방식을 선택하세요', 'error'); return; }
  const btn = document.getElementById('btn-guess-submit');
  btn.disabled = true;
  btn.textContent = '확인 중...';
  send({ type: 'guess_submit', methodOrder: isSingle ? [] : guessMethodOrder, answer });
}
