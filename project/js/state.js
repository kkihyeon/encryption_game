// ════════════════════════════════════════
//  STATE
// ════════════════════════════════════════
let peer, myId, isHost = false, roomId = '';
let myNick = '', selectedRounds = 1;
let connections = {}, conn = null;
let lobbyMode = 'host';

let currentMode = 'draw', drawColor = '#000000';
let drawing = false;
const canvas = document.getElementById('shared-canvas');
const ctx = canvas.getContext('2d');

let gameState = {
  status: 'lobby',
  phase: 'idle',
  players: {},
  turnOrder: [],
  currentTurnIdx: 0,
  currentRaw: '',
  currentMethods: [],
  currentEncSteps: [],
  currentKeys: {},
  lastEncResult: '',
  clueSet: [],
  totalRounds: 1,
  currentRound: 1,
  turnTimer: 90,
  turnTimerStart: 0,
  guessResults: {},
  pendingToast: null,
  designatedNextHost: null,
};

const ENC_TIME = 90;
const GUESS_TIME = 120;
let timerInterval = null;
let clientTimerInterval = null;

const PEER_DEBUG_LEVEL = 1;
const DEFAULT_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];
