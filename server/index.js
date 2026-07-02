import { WebSocketServer, WebSocket } from 'ws';
import { randomBytes } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const PORT      = process.env.PORT || 4001;
const DB_PATH   = './rooms.json';
const wss       = new WebSocketServer({ port: PORT });

// ── 영구 저장소 ───────────────────────────────────
// rooms.json: { [code]: { name, createdAt, createdBy } }
function loadRooms() {
  if (!existsSync(DB_PATH)) return {};
  try { return JSON.parse(readFileSync(DB_PATH, 'utf-8')); } catch { return {}; }
}

function saveRooms(rooms) {
  writeFileSync(DB_PATH, JSON.stringify(rooms, null, 2));
}

const rooms = loadRooms();

// ── 런타임 상태 (재시작 시 초기화됨) ─────────────
// sessions: { [code]: Map<clientId, { ws, member }> }
const sessions = {};

let nextId = 1;

// ── 코드 생성 ─────────────────────────────────────
function generateCode() {
  let code;
  do { code = randomBytes(3).toString('hex').toUpperCase(); }
  while (rooms[code]);
  return code;
}

// ── WebSocket ─────────────────────────────────────
wss.on('connection', (ws) => {
  const clientId = String(nextId++);
  let roomCode   = null;

  // 5초 안에 메시지 없으면 종료
  const authTimer = setTimeout(() => {
    if (!roomCode) ws.close();
  }, 5000);

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    // ── 방 생성 ────────────────────────────────────
    if (msg.type === 'createRoom') {
      if (!msg.name?.trim()) {
        return send(ws, { type: 'error', message: '이름을 입력해주세요.' });
      }
      const code = generateCode();
      rooms[code] = {
        name:      msg.roomName?.trim() || `${msg.name}의 방`,
        createdBy: msg.name.trim(),
        createdAt: Date.now(),
      };
      saveRooms(rooms);
      sessions[code] = new Map();

      clearTimeout(authTimer);
      roomCode = code;
      joinRoom(ws, clientId, code, msg.name.trim());
      send(ws, { type: 'roomCreated', code, roomName: rooms[code].name });
      console.log(`[방 생성] "${rooms[code].name}" (코드: ${code}) by ${msg.name}`);
      return;
    }

    // ── 방 참가 ────────────────────────────────────
    if (msg.type === 'joinRoom') {
      const code = msg.code?.trim().toUpperCase();

      if (!rooms[code]) {
        return send(ws, { type: 'error', message: '존재하지 않는 초대 코드예요.' });
      }
      if (!msg.name?.trim()) {
        return send(ws, { type: 'error', message: '이름을 입력해주세요.' });
      }

      if (!sessions[code]) sessions[code] = new Map();

      // 같은 방 내 이름 중복 체크
      const dup = [...sessions[code].values()].find(c => c.member.name === msg.name.trim());
      if (dup) {
        return send(ws, { type: 'error', message: `이미 "${msg.name}" 이름으로 접속 중인 사람이 있어요.` });
      }

      clearTimeout(authTimer);
      roomCode = code;
      joinRoom(ws, clientId, code, msg.name.trim());
      send(ws, { type: 'welcome', roomName: rooms[code].name });
      console.log(`[입장] ${msg.name} → "${rooms[code].name}" (${code})`);
      return;
    }

    // ── 인증된 후 메시지 ───────────────────────────
    if (!roomCode) return;
    const session = sessions[roomCode];
    if (!session) return;

    switch (msg.type) {
      case 'fileOpen': {
        const entry = session.get(clientId);
        if (!entry) break;
        entry.member.file = msg.file ?? null;
        broadcastRoom(roomCode, { type: 'memberUpdated', member: entry.member }, clientId);
        break;
      }
      case 'statusChange': {
        const entry = session.get(clientId);
        if (!entry) break;
        entry.member.status = msg.status;
        broadcastRoom(roomCode, { type: 'memberUpdated', member: entry.member }, clientId);
        break;
      }
      case 'notify': {
        const target = [...session.values()].find(c => c.member.name === msg.to);
        if (target) {
          send(target.ws, {
            type: 'notification',
            from: session.get(clientId)?.member.name,
            message: msg.message,
          });
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    clearTimeout(authTimer);
    if (!roomCode || !sessions[roomCode]) return;
    const entry = sessions[roomCode].get(clientId);
    if (entry) {
      console.log(`[퇴장] ${entry.member.name} ← "${rooms[roomCode]?.name}"`);
      sessions[roomCode].delete(clientId);
      broadcastRoom(roomCode, { type: 'memberLeft', id: clientId });
    }
  });

  ws.on('error', (err) => console.error(`[오류] ${clientId}:`, err.message));
});

// ── helpers ───────────────────────────────────────
function joinRoom(ws, clientId, code, name) {
  const member = { id: clientId, name, status: 'online', file: null };
  sessions[code].set(clientId, { ws, member });

  send(ws, { type: 'members', members: getRoomMembers(code) });
  broadcastRoom(code, { type: 'memberJoined', member }, clientId);
}

function getRoomMembers(code) {
  return [...(sessions[code]?.values() ?? [])].map(c => c.member);
}

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}

function broadcastRoom(code, data, excludeId = null) {
  const raw = JSON.stringify(data);
  for (const [id, { ws }] of (sessions[code] ?? [])) {
    if (id !== excludeId && ws.readyState === WebSocket.OPEN) ws.send(raw);
  }
}

const roomCount = Object.keys(rooms).length;
console.log(`\nTeam Pulse server  →  ws://localhost:${PORT}`);
console.log(`저장된 방: ${roomCount}개\n`);
