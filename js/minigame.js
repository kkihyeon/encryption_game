// ════════════════════════════════════════
//  MINI GAME — BLOCK STACK
//  출제자 대기(해독 단계) / 해독자 대기(출제 단계) 중 스페이스/클릭으로 블록을 쌓는 미니게임
// ════════════════════════════════════════

const MG = {
  W: 200, H: 220,
  BH: 18, BGAP: 2,
  INIT_W: 110,
  COLORS: ['#4da6ff', '#22c55e', '#ff6b35', '#a855f7', '#f5c842', '#ff8080'],
  state: null, // null | 'idle' | 'playing' | 'over'
  blocks: [],
  cur: null,   // { x, w, dir, speed, color }
  score: 0,
  raf: null,
};

function mgShow() {
  const wrap = document.getElementById('mini-game-wrap');
  if (!wrap || wrap.style.display === 'flex') return;
  wrap.style.display = 'flex';
  if (!MG.state) {
    MG.state = 'idle';
    mgRender();
  }
}

function mgHide() {
  const wrap = document.getElementById('mini-game-wrap');
  if (!wrap || wrap.style.display === 'none') return;
  wrap.style.display = 'none';
  if (MG.raf) { cancelAnimationFrame(MG.raf); MG.raf = null; }
  MG.state = null;
}

function mgStart() {
  if (MG.raf) cancelAnimationFrame(MG.raf);
  MG.state = 'playing';
  MG.score = 0;
  MG.blocks = [{ x: (MG.W - MG.INIT_W) / 2, w: MG.INIT_W, color: MG.COLORS[0] }];
  mgSpawn();
  MG.raf = requestAnimationFrame(mgLoop);
}

function mgSpawn() {
  const last = MG.blocks[MG.blocks.length - 1];
  MG.cur = {
    x: 0,
    w: last.w,
    dir: 1,
    speed: Math.min(2 + MG.score * 0.15, 7),
    color: MG.COLORS[MG.blocks.length % MG.COLORS.length],
  };
}

function mgDrop() {
  if (MG.state === 'idle' || MG.state === 'over') { mgStart(); return; }
  if (MG.state !== 'playing') return;

  const cur = MG.cur;
  const last = MG.blocks[MG.blocks.length - 1];
  const ol = Math.max(cur.x, last.x);
  const or = Math.min(cur.x + cur.w, last.x + last.w);
  const ow = or - ol;

  if (ow <= 0) { mgEndGame(); return; }
  MG.blocks.push({ x: ol, w: ow, color: cur.color });
  MG.score++;
  if (ow < 5) { mgEndGame(); return; }
  mgSpawn();
}

function mgEndGame() {
  if (MG.raf) { cancelAnimationFrame(MG.raf); MG.raf = null; }
  MG.state = 'over';
  mgRender();
}

function mgLoop() {
  if (MG.state !== 'playing') return;
  const c = MG.cur;
  c.x += c.dir * c.speed;
  if (c.x + c.w >= MG.W) { c.x = MG.W - c.w; c.dir = -1; }
  if (c.x <= 0) { c.x = 0; c.dir = 1; }
  mgRender();
  MG.raf = requestAnimationFrame(mgLoop);
}

function mgRender() {
  const canvas = document.getElementById('stack-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const { W, H, BH, BGAP } = MG;
  const stride = BH + BGAP;

  ctx.fillStyle = '#0d1520';
  ctx.fillRect(0, 0, W, H);

  if (MG.state === 'idle') {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#4da6ff';
    ctx.font = 'bold 17px Pretendard, sans-serif';
    ctx.fillText('BLOCK STACK', W / 2, H * 0.36);
    ctx.fillStyle = '#c8d6e5';
    ctx.font = '12px Pretendard, sans-serif';
    ctx.fillText('움직이는 블록을 정확히 쌓으세요', W / 2, H * 0.36 + 24);
    ctx.fillText('삐져나온 부분은 잘려나갑니다', W / 2, H * 0.36 + 42);
    ctx.fillStyle = '#7a95b0';
    ctx.font = '13px Pretendard, sans-serif';
    ctx.fillText('SPACE / 클릭으로 시작', W / 2, H * 0.36 + 72);
    return;
  }

  const n = MG.blocks.length;
  const curScreenY = 40; // 움직이는 블록 고정 y 위치

  // 쌓인 블록 렌더 (아래로)
  MG.blocks.forEach((b, i) => {
    const y = curScreenY + (n - i) * stride;
    if (y > H + BH || y < -BH) return;
    ctx.fillStyle = b.color;
    mgDrawBlock(ctx, b.x, y, b.w, BH);
  });

  // 움직이는 블록
  if (MG.state === 'playing' && MG.cur) {
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = MG.cur.color;
    mgDrawBlock(ctx, MG.cur.x, curScreenY, MG.cur.w, BH);
    ctx.globalAlpha = 1;
  }

  // 점수
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = 'bold 20px Pretendard, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(MG.score, W / 2, 28);

  // 게임 오버
  if (MG.state === 'over') {
    ctx.fillStyle = 'rgba(10,18,30,0.78)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff8080';
    ctx.font = 'bold 20px Pretendard, sans-serif';
    ctx.fillText('GAME OVER', W / 2, H / 2 - 18);
    ctx.fillStyle = '#4da6ff';
    ctx.font = 'bold 16px Pretendard, sans-serif';
    ctx.fillText('점수: ' + MG.score, W / 2, H / 2 + 10);
    ctx.fillStyle = '#7a95b0';
    ctx.font = '12px Pretendard, sans-serif';
    ctx.fillText('SPACE / 클릭으로 재시작', W / 2, H / 2 + 40);
  }
}

function mgDrawBlock(ctx, x, y, w, h) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, 3);
  else ctx.rect(x, y, w, h);
  ctx.fill();
}

// 스페이스바: 입력 필드 포커스 중엔 무시, 미니게임 표시 중일 때만 작동
document.addEventListener('keydown', e => {
  if (e.code !== 'Space') return;
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  const wrap = document.getElementById('mini-game-wrap');
  if (wrap && wrap.style.display === 'flex') {
    e.preventDefault();
    mgDrop();
  }
});
