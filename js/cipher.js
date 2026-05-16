// ════════════════════════════════════════
//  CIPHER METHODS
//  암호화 알고리즘 정의 및 라우팅 (공통)
// ════════════════════════════════════════

// ID → 방식 매핑 (name=표시명, color=UI 색상, short=칩 약어)
const METHODS = {
  1: { name: '키 순서', color: '#ff6b35', short: 'KEY' },
  2: { name: '에너그램', color: '#a855f7', short: 'ANA' },
  3: { name: '카이사르', color: '#22c55e', short: 'CAE' },
  4: { name: '스키테일', color: '#4da6ff', short: 'SKY' }
};

// 알파벳 각 글자를 오른쪽으로 shift 칸 이동 (Z 이후 A로 순환)
function caesarEnc(s, shift) {
  shift = ((shift % 26) + 26) % 26;
  return s.split('').map(c => {
    if (c >= 'a' && c <= 'z') return String.fromCharCode((c.charCodeAt(0)-97+shift)%26+97);
    if (c >= 'A' && c <= 'Z') return String.fromCharCode((c.charCodeAt(0)-65+shift)%26+65);
    return c;
  }).join('');
}

// unit 크기 단위로 잘라 각 단위를 역순으로 뒤집기
function anagramEnc(s, unit) {
  unit = Math.max(1, parseInt(unit) || 3);
  let result = '';
  for (let i = 0; i < s.length; i += unit) {
    result += s.slice(i, i + unit).split('').reverse().join('');
  }
  return result;
}

// '312' → [3,1,2] 자릿수 위치 배열 파싱
function _keyOrder(keyNum) {
  return String(keyNum).split('').map(Number).filter(n => n >= 1);
}

// 키 순열에 따라 n글자 단위로 위치를 재배열
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
      result += chunk; // 나머지 청크는 키 자릿수보다 짧으므로 순서 그대로
    }
  }
  return result;
}

// rails행 격자에 가로로 채우고 세로(열) 방향으로 읽어 암호문 생성
function scytaleEnc(s, rails) {
  rails = Math.max(2, rails || 3);
  const cols = Math.ceil(s.length / rails);
  let result = '';
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rails; row++) {
      const idx = row * cols + col;
      if (idx < s.length) result += s[idx];
    }
  }
  return result;
}

// 방식 ID(1~4)에 따라 해당 암호화 함수 호출
function applyEnc(s, m, key) {
  if (m===1) return keyEnc(s, key);
  if (m===2) return anagramEnc(s, key);
  if (m===3) return caesarEnc(s, key);
  if (m===4) return scytaleEnc(s, key);
  return s;
}
