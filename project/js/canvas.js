// ════════════════════════════════════════
//  CANVAS
// ════════════════════════════════════════
let lastDrawX = 0, lastDrawY = 0;

function resizeCanvas() {
  const w = canvas.offsetWidth, h = canvas.offsetHeight;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  canvas.width = w; canvas.height = h;
  ctx.putImageData(img, 0, 0);
}

function initCanvas() {
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

function setMode(m) {
  currentMode = m;
  document.getElementById('btn-draw').classList.toggle('active', m==='draw');
  document.getElementById('btn-erase').classList.toggle('active', m==='erase');
  canvas.style.cursor = m==='erase' ? 'cell' : 'crosshair';
}

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

function setColor(el) {
  drawColor = el.dataset.color;
  document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('selected'));
  el.classList.add('selected');
  setMode('draw');
}

// ════════════════════════════════════════
//  REACTIONS
// ════════════════════════════════════════
function sendReaction(emoji) {
  showFloatingReaction(emoji);
  const data = { type:'reaction', emoji };
  if (isHost) Object.values(connections).forEach(c => c.send(data));
  else conn.send(data);
}

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
// ════════════════════════════════════════
window.addEventListener('resize', () => {
  if (canvas.offsetWidth > 0) resizeCanvas();
});
