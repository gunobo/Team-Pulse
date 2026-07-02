import { WebSocketServer, WebSocket } from 'ws';
import { randomBytes }                from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createServer }               from 'http';

const PORT         = process.env.PORT        || 4001;
const CLIENT_ID    = process.env.GITHUB_CLIENT_ID;
const CLIENT_SECRET= process.env.GITHUB_CLIENT_SECRET;
const GITHUB_REPO  = process.env.GITHUB_REPO || 'gunobo/Team-Pulse';
const DB_PATH      = './rooms.json';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET 환경변수 필요');
  process.exit(1);
}

// ── 영구 저장소 ───────────────────────────────────
function loadRooms() {
  if (!existsSync(DB_PATH)) return {};
  try { return JSON.parse(readFileSync(DB_PATH, 'utf-8')); } catch { return {}; }
}
function saveRooms(rooms) {
  writeFileSync(DB_PATH, JSON.stringify(rooms, null, 2));
}
const rooms = loadRooms();

// ── 런타임 상태 ───────────────────────────────────
const sessions    = {};          // roomCode → Map<clientId, {ws, member}>
const authPending = new Map();   // state → { token, githubUser, expires }
const validTokens = new Map();   // token → githubLogin
const rateLimitMap= new Map();   // ip    → { last, fails }
const MAX_FAILS   = 10000;
let nextId        = 1;

// ── helpers ───────────────────────────────────────
function generateCode() {
  let code;
  do { code = randomBytes(4).toString('hex').toUpperCase(); }
  while (rooms[code]);
  return code;
}

function getIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim()
      || req.socket.remoteAddress;
}

// ── GitHub API ────────────────────────────────────
async function exchangeCode(code) {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code }),
  });
  return res.json();
}

async function getGithubUser(accessToken) {
  const res = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'Team-Pulse' },
  });
  return res.json();
}

async function isCollaborator(login, accessToken) {
  const [owner, repo] = GITHUB_REPO.split('/');
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/collaborators/${login}`,
    { headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'Team-Pulse' } }
  );
  return res.status === 204; // 204 = collaborator 맞음
}

// ── HTTP 서버 (OAuth 콜백) ────────────────────────
const httpServer = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost`);

  // GitHub → 이쪽으로 리다이렉트
  if (url.pathname === '/auth/callback') {
    const code  = url.searchParams.get('code');
    const state = url.searchParams.get('state');

    if (!code || !state || !authPending.has(state)) {
      res.writeHead(400);
      res.end('잘못된 요청');
      return;
    }

    try {
      const { access_token } = await exchangeCode(code);
      const user             = await getGithubUser(access_token);
      const allowed          = await isCollaborator(user.login, access_token);

      if (!allowed) {
        authPending.delete(state);
        res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<h2>❌ ${user.login}은 ${GITHUB_REPO} collaborator가 아니에요.</h2>`);
        return;
      }

      // 토큰 발급
      const token = randomBytes(16).toString('hex');
      validTokens.set(token, user.login);
      authPending.set(state, { token, login: user.login });

      console.log(`[인증] ${user.login} ✓`);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<h2>✅ ${user.login} 인증 완료! VS Code로 돌아가세요.</h2><script>window.close()</script>`);
    } catch (err) {
      console.error('[OAuth 오류]', err);
      res.writeHead(500);
      res.end('인증 오류');
    }
    return;
  }

  // Extension이 폴링: 토큰 준비됐나?
  if (url.pathname === '/auth/status') {
    const state  = url.searchParams.get('state');
    const entry  = authPending.get(state);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (entry?.token) {
      authPending.delete(state);
      res.end(JSON.stringify({ ready: true, token: entry.token, login: entry.login }));
    } else {
      res.end(JSON.stringify({ ready: false }));
    }
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

httpServer.listen(PORT, () => {
  console.log(`\nTeam Pulse server  →  ws://localhost:${PORT}`);
  console.log(`OAuth callback     →  http://localhost:${PORT}/auth/callback`);
  console.log(`Repo 제한          →  ${GITHUB_REPO}`);
  console.log(`저장된 방: ${Object.keys(rooms).length}개\n`);
});

// ── WebSocket ─────────────────────────────────────
const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws, req) => {
  const ip    = getIP(req);
  const now   = Date.now();
  const entry = rateLimitMap.get(ip) ?? { last: 0, fails: 0 };

  if (entry.fails >= MAX_FAILS) {
    ws.close(1008, 'Banned');
    return;
  }
  if (now - entry.last < 3000) {
    ws.close(1008, 'Rate limited');
    return;
  }
  rateLimitMap.set(ip, { ...entry, last: now });

  const clientId = String(nextId++);
  let roomCode   = null;

  const authTimer = setTimeout(() => {
    if (!roomCode) ws.close();
  }, 10000);

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    // ── 토큰 검증 (모든 메시지 앞에) ──────────────
    if (!roomCode && msg.type !== 'createRoom' && msg.type !== 'joinRoom') return;

    if ((msg.type === 'createRoom' || msg.type === 'joinRoom') && !validTokens.has(msg.token)) {
      send(ws, { type: 'error', message: 'GitHub 인증이 필요해요.' });
      ws.close();
      return;
    }

    const githubLogin = validTokens.get(msg.token);

    // ── 방 생성 ────────────────────────────────────
    if (msg.type === 'createRoom') {
      const code = generateCode();
      rooms[code] = {
        name:      msg.roomName?.trim() || `${githubLogin}의 방`,
        createdBy: githubLogin,
        createdAt: Date.now(),
      };
      saveRooms(rooms);
      sessions[code] = new Map();

      clearTimeout(authTimer);
      roomCode = code;
      joinRoom(ws, clientId, code, githubLogin);
      send(ws, { type: 'roomCreated', code, roomName: rooms[code].name });
      console.log(`[방 생성] "${rooms[code].name}" (${code}) by ${githubLogin}`);
      return;
    }

    // ── 방 참가 ────────────────────────────────────
    if (msg.type === 'joinRoom') {
      const code = msg.code?.trim().toUpperCase();
      if (!rooms[code]) {
        const e = rateLimitMap.get(ip) ?? { last: 0, fails: 0 };
        rateLimitMap.set(ip, { ...e, fails: e.fails + 1 });
        return send(ws, { type: 'error', message: '존재하지 않는 초대 코드예요.' });
      }
      if (!sessions[code]) sessions[code] = new Map();

      const dup = [...sessions[code].values()].find(c => c.member.name === githubLogin);
      if (dup) return send(ws, { type: 'error', message: `이미 접속 중이에요.` });

      clearTimeout(authTimer);
      roomCode = code;
      joinRoom(ws, clientId, code, githubLogin);
      send(ws, { type: 'welcome', roomName: rooms[code].name });
      console.log(`[입장] ${githubLogin} → "${rooms[code].name}" (${code})`);
      return;
    }

    // ── 인증 후 메시지 ─────────────────────────────
    const session = sessions[roomCode];
    if (!session) return;

    switch (msg.type) {
      case 'fileOpen': {
        const e = session.get(clientId);
        if (e) { e.member.file = msg.file ?? null; broadcastRoom(roomCode, { type: 'memberUpdated', member: e.member }, clientId); }
        break;
      }
      case 'statusChange': {
        const e = session.get(clientId);
        if (e) { e.member.status = msg.status; broadcastRoom(roomCode, { type: 'memberUpdated', member: e.member }, clientId); }
        break;
      }
      case 'notify': {
        const target = [...session.values()].find(c => c.member.name === msg.to);
        if (target) send(target.ws, { type: 'notification', from: githubLogin, message: msg.message });
        break;
      }
    }
  });

  ws.on('close', () => {
    clearTimeout(authTimer);
    if (!roomCode || !sessions[roomCode]) return;
    const e = sessions[roomCode].get(clientId);
    if (e) {
      console.log(`[퇴장] ${e.member.name}`);
      sessions[roomCode].delete(clientId);
      broadcastRoom(roomCode, { type: 'memberLeft', id: clientId });
    }
  });

  ws.on('error', (err) => console.error(`[오류]`, err.message));
});

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
