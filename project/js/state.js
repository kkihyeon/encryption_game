// ════════════════════════════════════════
//  STATE
//  전역 변수 및 게임 상태 초기값 (공통)
// ════════════════════════════════════════

// P2P 연결 및 역할
let peer, myId, isHost = false, roomId = '';
let myNick = '', selectedRounds = 1;
let connections = {}, conn = null; // connections: 호스트가 관리하는 클라이언트 맵
let lobbyMode = 'host';            // 로비: 현재 선택된 탭 (host | join)
let disconnectExpected = false;    // nick_taken으로 의도적 연결 해제 시 close 토스트 억제용

// 인게임 — 캔버스 상태
let currentMode = 'draw', drawColor = '#000000';
let drawing = false;
const canvas = document.getElementById('shared-canvas');
const ctx = canvas.getContext('2d');

// 인게임 — 게임 진행 상태
let gameState = {
  status: 'lobby',         // lobby | playing | finished
  phase: 'idle',           // idle | encoding | guessing | round_end
  players: {},             // { peerId: { nick, score, online } }
  turnOrder: [],           // 출제 순서 (게임 시작 시 랜덤 셔플)
  currentTurnIdx: 0,       // 현재 출제자 인덱스 (turnOrder 기준)
  currentRaw: '',          // 출제자가 입력한 원본 메시지
  currentMethods: [],      // 사용된 암호화 방식 ID 배열 (순서대로)
  currentEncSteps: [],     // 각 단계 암호화 결과 { methodId, result }
  currentKeys: {},         // 방식별 키값 { methodId: keyValue }
  lastEncResult: '',       // 해독자에게 공개되는 최종 암호문
  clueSet: [],             // 힌트 공개용 방식 ID 배열 (정렬만, 순서 비공개)
  totalRounds: 1,
  currentRound: 1,
  turnTimer: 90,           // 남은 시간(초) — broadcast 시 클라이언트에 전달
  turnTimerStart: 0,       // Date.now() 기준 타이머 시작 시각
  guessResults: {},        // { peerId: { correct, points } }
  pendingToast: null,      // 다음 sync 때 클라이언트에게 전달할 토스트 { msg, type }
};

// 타이머 제한 시간 (초)
const ENC_TIME = 90;
const GUESS_TIME = 120;
let timerInterval = null;       // 호스트 타이머 인터벌
let clientTimerInterval = null; // 클라이언트 로컬 타이머 인터벌

// P2P 디버그 레벨 및 기본 STUN 서버 (WAN 모드)
const PEER_DEBUG_LEVEL = 1;
const DEFAULT_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];
