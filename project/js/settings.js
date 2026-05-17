// ════════════════════════════════════════
//  SERVER SETTINGS UI
//  로비: 네트워크 설정 패널 (WAN/LAN 모드 선택 및 저장)
// ════════════════════════════════════════
let _srvPanelOpen = false;

// 로비: 네트워크 설정 패널 펼치기/접기 토글
function toggleServerSettings() {
  _srvPanelOpen = !_srvPanelOpen;
  document.getElementById('srv-panel').style.display = _srvPanelOpen ? 'block' : 'none';
  document.getElementById('srv-arrow').textContent = _srvPanelOpen ? '▲' : '▼';
}

// 로비: WAN(P2P) / LAN(WebSocket) 모드 전환 및 해당 설정 패널 표시
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

// 로비(LAN): 호스트 IP·포트 저장
function saveSrvLan() {
  const host = (document.getElementById('srv-ws-host-input').value || '').trim();
  const port = (document.getElementById('srv-ws-port-input').value || '9000').trim();
  if (!host) { showToast('호스트 IP를 입력하세요.', 'error'); return; }
  localStorage.setItem('enc_ws_host', host);
  localStorage.setItem('enc_ws_port', port || '9000');
  showToast('✅ 저장되었습니다.', 'success');
}

// 로비(LAN): server.py /api/info 엔드포인트에서 내 IP 자동 감지 (2.5초 타임아웃)
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
    if (hintEl) hintEl.textContent = 'server.py가 먼저 실행중인지 확인하세요';
  }
}

// 로비: 페이지 로드 시 localStorage 설정값을 패널 UI에 반영
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
