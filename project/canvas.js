// ════════════════════════════════════════
//  CANVAS
//  인게임: 공유 칠판 그리기·지우기·모드 전환
// ════════════════════════════════════════
let lastDrawX = 0, lastDrawY = 0;

// 인게임: 캔버스 크기를 컨테이너에 맞추고 기존 그림 보존
function resizeCanvas() {
  const w = canvas.offsetWidth, h = canvas.offsetHeight;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  canvas.width = w; canvas.height = h;
  ctx.putImageData(img, 0, 0);
}

// 인게임: 마우스·터치 이벤트 등록 (showGameUI 시 1회만 호출되도록 guard)
function initCanvas() {
  if (canvas._initialized) return;
  canvas._initialized = true;
  canvas.addEventListener('mousedown', e => {
    drawing = true;
    const rect = canvas.getBoundingClientRect();
    lastDrawX = (e.clientX - rect.left) * (canvas.width / rect.width);
    lastDrawY = (e.clientY - rect.top) * (canvas.height / rect.height);
    if (currentMode !== 'erase') {
      ctx.fillStyle = drawColor;
      ctx.beginPath();
      ctx.arc(lastDrawX, lastDrawY, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  canvas.addEventListener('mousemove', e => { if (drawing) handleDraw(e); });
  window.addEventListener('mouseup', () => drawing = false);
  canvas.addEventListener('touchstart', e => {
    drawing = true;
    const rect = canvas.getBoundingClientRect();
    lastDrawX = (e.touches[0].clientX - rect.left) * (canvas.width / rect.width);
    lastDrawY = (e.touches[0].clientY - rect.top) * (canvas.height / rect.height);
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchmove', e => { if (drawing) handleDraw(e.touches[0]); e.preventDefault(); }, { passive: false });
  canvas.addEventListener('touchend', () => drawing = false);
}

// 인게임: 실제 선 그리기 또는 지우기 처리
function handleDraw(e) {
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (canvas.width / rect.width);
  const y = (e.clientY - rect.top) * (canvas.height / rect.height);
  if (currentMode === 'erase') {
    ctx.clearRect(x - 12, y - 12, 24, 24);
    lastDrawX = x; lastDrawY = y;
    return;
  }
  ctx.strokeStyle = drawColor;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(lastDrawX, lastDrawY);
  ctx.lineTo(x, y);
  ctx.stroke();
  lastDrawX = x;
  lastDrawY = y;
}

function clearCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// 인게임: 펜/지우기 모드 전환 및 커서 변경
function setMode(m) {
  currentMode = m;
  document.getElementById('btn-draw').classList.toggle('active', m==='draw');
  document.getElementById('btn-erase').classList.toggle('active', m==='erase');
  canvas.style.cursor = m==='erase' ? 'cell' : 'crosshair';
}

// 인게임: 그리기(캔버스) / 메모장 보드 전환
let boardMode = 'draw';
function setBoardMode(mode) {
  boardMode = mode;
  const isDraw = mode === 'draw';
  document.getElementById('btn-mode-draw').classList.toggle('active', isDraw);
  document.getElementById('btn-mode-memo').classList.toggle('active', !isDraw);
  canvas.style.display = isDraw ? '' : 'none';
  document.getElementById('memo-area').style.display = isDraw ? 'none' : 'block';
  ['btn-draw','btn-erase','btn-clear-draw'].forEach(id => {
    document.getElementById(id).style.display = isDraw ? '' : 'none';
  });
  document.querySelectorAll('.color-dot').forEach(d => { d.style.display = isDraw ? '' : 'none'; });
}

// 인게임: 색상 선택 — 선택 도트 하이라이트 및 자동으로 펜 모드 전환
function setColor(el) {
  drawColor = el.dataset.color;
  document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('selected'));
  el.classList.add('selected');
  setMode('draw');
}

// ════════════════════════════════════════
//  REACTIONS
//  인게임: 리액션 이모지 전송 및 플로팅 애니메이션
// ════════════════════════════════════════

// 인게임: 리액션 발송 — 호스트는 전체 브로드캐스트, 클라이언트는 호스트로 전송
function sendReaction(emoji) {
  showFloatingReaction(emoji);
  const data = { type:'reaction', emoji };
  if (isHost) Object.values(connections).forEach(c => c.send(data));
  else conn.send(data);
}

// 인게임: 리액션 이모지 화면 위로 떠오르는 애니메이션 표시
function showFloatingReaction(emoji) {
  const el = document.createElement('div');
  el.className = 'floating-reaction';
  el.textContent = emoji;
  el.style.left = (Math.random()*(window.innerWidth-80)+40)+'px';
  el.style.bottom = '160px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2100);
}

// ════════════════════════════════════════
//  RESIZE
//  공통: 창 크기 변경 시 캔버스 리사이즈
// ════════════════════════════════════════
window.addEventListener('resize', () => {
  if (canvas.offsetWidth > 0) resizeCanvas();
});
