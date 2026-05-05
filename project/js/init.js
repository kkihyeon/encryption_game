// ════════════════════════════════════════
//  INIT
// ════════════════════════════════════════
switchTab('host');
initServerSettings();

(function checkRecovery() {
  const s = loadLatestSession();
  if (!s) return;
  document.getElementById('user-nick').value = s.nick;
  document.getElementById('room-id').value = s.roomId.replace(/^CGv4-/, '');
  switchTab('join');
  const banner = document.getElementById('recovery-banner');
  if (!banner) return;
  document.getElementById('recovery-info').textContent =
    s.nick + ' • 방: ' + s.roomId.replace(/^CGv4-/, '') + ' — 이전 세션을 복구하시겠습니까?';
  banner.style.display = '';
})();
