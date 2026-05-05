// ════════════════════════════════════════
//  CIPHER METHODS
// ════════════════════════════════════════
const METHODS = {
  1: { name: '키 순서', color: '#ff6b35', short: 'KEY' },
  2: { name: '애너그램', color: '#a855f7', short: 'ANA' },
  3: { name: '카이사르', color: '#22c55e', short: 'CAE' },
  4: { name: '스키테일', color: '#4da6ff', short: 'SKY' }
};

function caesarEnc(s, shift) {
  shift = ((shift % 26) + 26) % 26;
  return s.split('').map(c => {
    if (c >= 'a' && c <= 'z') return String.fromCharCode((c.charCodeAt(0)-97+shift)%26+97);
    if (c >= 'A' && c <= 'Z') return String.fromCharCode((c.charCodeAt(0)-65+shift)%26+65);
    return c;
  }).join('');
}
function anagramEnc(s, unit) {
  unit = Math.max(1, parseInt(unit) || 3);
  let result = '';
  for (let i = 0; i < s.length; i += unit) {
    result += s.slice(i, i + unit).split('').reverse().join('');
  }
  return result;
}
function _keyOrder(keyNum) {
  return String(keyNum).split('').map(Number).filter(n => n >= 1);
}
function keyEnc(s, keyNum) {
  const order = _keyOrder(keyNum);
  if (!order.length) return s;
  const n = order.length;
  let result = '';
  for (let i = 0; i < s.length; i += n) {
    const chunk = s.slice(i, i + n);
    if (chunk.length === n) {
      result += order.map(o => chunk[o - 1]).join('');
    } else {
      for (let j = 0; j < order.length; j++) {
        if (order[j] <= chunk.length) result += chunk[order[j] - 1];
      }
    }
  }
  return result;
}
function scytaleEnc(s, rails) {
  rails = Math.max(2, rails || 3);
  const len = s.length;
  const cols = Math.ceil(len / rails);
  const padded = s.padEnd(rails * cols, '_');
  let result = '';
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rails; row++) {
      const idx = row * cols + col;
      if (idx < rails * cols) result += padded[idx];
    }
  }
  return result.slice(0, len + (result.slice(len).replace(/_/g,'').length));
}
function applyEnc(s, m, key) {
  if (m===1) return keyEnc(s, key);
  if (m===2) return anagramEnc(s, key);
  if (m===3) return caesarEnc(s, key);
  if (m===4) return scytaleEnc(s, key);
  return s;
}
