// ════════════════════════════════════════
//  SERVER SETTINGS UI
// ════════════════════════════════════════
let _srvPanelOpen = false;

function toggleServerSettings() {
  _srvPanelOpen = !_srvPanelOpen;
  document.getElementById('srv-panel').style.display = _srvPanelOpen ? 'block' : 'none';
  document.getElementById('srv-arrow').textContent = _srvPanelOpen ? '▲' : '▼';
}

function setServerMode(mode) {
  localStorage.setItem('enc_server_mode', mode);
  const isLan = mode === 'lan';
  document.getElementById('srv-lan-btn').classList.toggle('active', isLan);
  document.getElementById('srv-wan-btn').classList.toggle('active', !isLan);
  document.getElementById('srv-lan-cfg').style.display = isLan ? 'block' : 'none';
  document.getElementById('srv-wan-cfg').style.display = isLan ? 'none' : 'block';
  const dot = document.getElementById('srv-dot');
  if (dot) dot.className = 'srv-dot ' + mode;
  if (isLan) fetchMyLanIp();
}

function saveSrvLan() {
  const host = (document.getElementById('srv-ws-host-input').value || '').trim();
  const port = (document.getElementById('srv-ws-port-input').value || '9000').trim();
  if (!host) { showToast('호스트 IP를 입력하세요.', 'error'); return; }
  localStorage.setItem('enc_ws_host', host);
  localStorage.setItem('enc_ws_port', port || '9000');
  showToast('✅ 저장되었습니다.', 'success');
}

async function fetchMyLanIp() {
  const ipEl = document.getElementById('my-lan-ip');
  const hintEl = document.getElementById('my-lan-ip-hint');
  if (!ipEl) return;
  ipEl.textContent = '감지 중...';
  ipEl.style.color = 'var(--accent)';

  const port = (localStorage.getItem('enc_ws_port') || '9000').trim();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(`http://127.0.0.1:${port}/api/info`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error('status ' + res.status);
    const data = await res.json();
    if (data.ip) {
      ipEl.textContent = data.ip + ':' + (data.port || port);
      ipEl.style.color = 'var(--accent)';
      if (hintEl) hintEl.textContent = '이 IP:포트를 팀원에게 알려주세요 (호스트라면)';
    } else {
      throw new Error('no ip');
    }
  } catch(e) {
    ipEl.textContent = '감지 실패';
    ipEl.style.color = 'var(--text3)';
    if (hintEl) hintEl.textContent = 'server.py를 먼저 실행한 뒤 이 패널을 열어보세요';
  }
}

function initServerSettings() {
  const mode = localStorage.getItem('enc_server_mode') || 'wan';
  const isLan = mode === 'lan';
  document.getElementById('srv-lan-btn').classList.toggle('active', isLan);
  document.getElementById('srv-wan-btn').classList.toggle('active', !isLan);
  document.getElementById('srv-lan-cfg').style.display = isLan ? 'block' : 'none';
  document.getElementById('srv-wan-cfg').style.display = isLan ? 'none' : 'block';
  const dot = document.getElementById('srv-dot');
  if (dot) dot.className = 'srv-dot ' + mode;

  const wsHost = localStorage.getItem('enc_ws_host') || '';
  const wsPort = localStorage.getItem('enc_ws_port') || '9000';
  const wsHostEl = document.getElementById('srv-ws-host-input');
  const wsPortEl = document.getElementById('srv-ws-port-input');
  if (wsHostEl) wsHostEl.value = wsHost;
  if (wsPortEl) wsPortEl.value = wsPort;

  if (isLan) fetchMyLanIp();
}
