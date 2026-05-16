// ════════════════════════════════════════
//  GAME FLOW
//  인게임: 게임 시작·턴 진행·타이머 (호스트 전용)
// ════════════════════════════════════════

// 인게임(호스트): 게임 시작 — 플레이어 순서 셔플 후 첫 출제 단계로 진입
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

// 인게임(호스트): 타이머 — 시간 초과 시 자동으로 다음 단계 전환
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
        const encoder = gameState.turnOrder[gameState.currentTurnIdx % gameState.turnOrder.length];
        if (gameState.players[encoder]) gameState.players[encoder].score -= 5;
        gameState.currentRaw = '⏰ 출제 시간 초과';
        gameState.phase = 'round_end';
        broadcast();
        setTimeout(() => nextTurn(), 5000);
      } else if (gameState.phase === 'guessing') {
        // 미제출 해독자는 오답 처리
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

// 인게임(호스트): 다음 턴으로 전환 — 모든 턴 소진 시 게임 종료
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

// 인게임: 새 턴 시작 시 캔버스·메모·입력 필드·선택 상태 초기화
function resetLocalState() {
  // 그림판·메모장은 개인 작업 공간이므로 턴이 바뀌어도 유지
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
//  인게임(출제 UI): 암호화 방식 선택·키 입력·결과 제출
// ════════════════════════════════════════
let encStepMethods = [];

// 인게임(출제 UI): 방식 선택 버튼 초기화 (최초 showGameUI 시 1회 호출)
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

// 인게임(출제 UI): 방식 추가 (이미 선택된 방식이면 제거, 최대 2단계)
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

// 인게임(출제 UI): 방식 제거 — 키 입력 필드도 함께 제거
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

// 인게임(출제 UI): 선택된 방식 버튼에 .selected 클래스 토글
function updateMethodBtnSelected() {
  document.querySelectorAll('.method-btn').forEach(btn => {
    const id = parseInt(btn.dataset.id);
    btn.classList.toggle('selected', encStepMethods.includes(id));
  });
}

// 인게임(출제 UI): 현재 선택된 단계 수에 따라 입력 행 표시/숨김 및 placeholder 갱신
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

// 인게임(출제 UI): 방식별 키 입력 필드 동적 생성 (methodId가 같으면 재생성 안 함)
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

// 인게임(출제 UI): 키 입력 값 파싱 (키 순서=문자열, 나머지=정수)
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

function onRawInput() { checkEncReady(); }

// 인게임(출제 UI): 수동 입력 표시 (dataset.manual=1이면 자동 채우기 건너뜀)
document.getElementById('enc-input-1').oninput = function() { this.dataset.manual='1'; checkEncReady(); };
document.getElementById('enc-input-2').oninput = function() { this.dataset.manual='1'; checkEncReady(); };

// 인게임(출제 UI): 제출 버튼 활성화 조건 — 원본·방식·모든 단계 결과 입력 여부 확인
function checkEncReady() {
  const raw = document.getElementById('raw-input').value.trim();
  const s1ok = encStepMethods.length===0 || document.getElementById('enc-input-1').value.trim();
  const s2ok = encStepMethods.length<=1 || document.getElementById('enc-input-2').value.trim();
  const ready = raw && encStepMethods.length>0 && s1ok && s2ok;
  document.getElementById('btn-enc-submit').disabled = !ready;
}

// 인게임(출제 UI): 암호화 제출 — enc_submit 메시지 전송 후 입력 필드 초기화
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
//  인게임(해독 UI): 복호화 순서 선택 및 원본 메시지 제출
// ════════════════════════════════════════
let guessMethodOrder = [];
let guessUIBuiltForTurn = -1; // 동일 턴에 UI 중복 빌드 방지용 인덱스

// 인게임(해독 UI): 복호화 순서 선택 버튼 목록 빌드 (턴 변경 시에만 재빌드)
function renderGuessUI() {
  const steps = document.getElementById('guess-steps');
  if (guessUIBuiltForTurn === gameState.currentTurnIdx && steps.childElementCount > 0) return;
  guessUIBuiltForTurn = gameState.currentTurnIdx;
  steps.innerHTML = '';

  const label = document.getElementById('guess-ui-label');
  const num = gameState.clueSet.length;
  if (label) label.textContent = num === 1 ? '암호화 방식 선택 및 원본 입력' : '복호화 순서 추측 및 원본 입력';
  guessMethodOrder = new Array(num).fill(null);
  for (let i=0; i<num; i++) {
    const div = document.createElement('div');
    div.className = 'guess-step';
    const sn = document.createElement('div');
    sn.className = 'step-num'; sn.textContent = i+1;
    const row = document.createElement('div');
    row.className = 'guess-method-row';
    [1, 2, 3, 4].forEach(mId => {
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

// 인게임(해독 UI): 해독 제출 — 방식 순서·원본 메시지를 guess_submit으로 전송
function submitGuess() {
  const answer = document.getElementById('guess-answer').value.trim();
  if (!answer) { showToast('원본 메시지를 입력하세요', 'error'); return; }
  if (guessMethodOrder.some(v => v===null)) { showToast('암호화 방식을 선택하세요', 'error'); return; }
  const btn = document.getElementById('btn-guess-submit');
  btn.disabled = true;
  btn.textContent = '확인 중...';
  send({ type: 'guess_submit', methodOrder: guessMethodOrder, answer });
}
