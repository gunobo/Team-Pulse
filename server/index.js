import { WebSocketServer, WebSocket } from 'ws';
import { randomBytes }                from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createServer }               from 'http';

const PORT          = process.env.PORT             || 4001;
const CLIENT_ID     = process.env.GITHUB_CLIENT_ID;
const CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const ADMIN_PASSWORD= process.env.ADMIN_PASSWORD   || 'admin';
const DB_PATH       = './rooms.json';
const TOKENS_PATH   = './tokens.json';

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

function loadTokens() {
  if (!existsSync(TOKENS_PATH)) return new Map();
  try {
    const obj = JSON.parse(readFileSync(TOKENS_PATH, 'utf-8'));
    const now = Date.now();
    const map = new Map();
    for (const [token, data] of Object.entries(obj)) {
      if (data.expiresAt > now) map.set(token, data);
    }
    return map;
  } catch { return new Map(); }
}
function saveTokens(tokens) {
  const obj = Object.fromEntries(tokens);
  writeFileSync(TOKENS_PATH, JSON.stringify(obj, null, 2));
}
if (!existsSync(TOKENS_PATH)) saveTokens(new Map());

const rooms = loadRooms();

// ── 런타임 상태 ───────────────────────────────────
const sessions    = {};          // roomCode → Map<clientId, {ws, member}>
const authPending = new Map();   // state → { token, githubUser, expires }
const validTokens = loadTokens(); // token → { login, accessToken, expiresAt }
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

async function isCollaborator(login, accessToken, githubRepo) {
  const [owner, repo] = githubRepo.split('/');
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/collaborators/${login}`,
    { headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'Team-Pulse' } }
  );
  return res.status === 204;
}

// ── HTTP 서버 (OAuth 콜백) ────────────────────────
const httpServer = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost`);

  // GitHub → 이쪽으로 리다이렉트
  if (url.pathname === '/auth/callback') {
    const code     = url.searchParams.get('code');
    const state    = url.searchParams.get('state');
    const roomCode = url.searchParams.get('roomCode');

    // state가 없으면 새로 등록
    if (state && !authPending.has(state)) {
      authPending.set(state, { roomCode: roomCode || null });
    }

    if (!code || !state) {
      res.writeHead(400);
      res.end('잘못된 요청');
      return;
    }

    try {
      const { access_token } = await exchangeCode(code);
      const user             = await getGithubUser(access_token);

      // state에 연결된 roomCode로 어떤 레포인지 확인
      const pending    = authPending.get(state);
      const joinCode   = pending?.roomCode;
      const githubRepo = joinCode ? rooms[joinCode]?.repo : null;

      if (githubRepo) {
        const allowed = await isCollaborator(user.login, access_token, githubRepo);
        if (!allowed) {
          authPending.delete(state);
          res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<h2>❌ ${user.login}은 <b>${githubRepo}</b> collaborator가 아니에요.</h2>`);
          return;
        }
      }

      // 토큰 발급 (accessToken도 보관 — 레포 목록 조회에 사용)
      const token = randomBytes(16).toString('hex');
      const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
      validTokens.set(token, { login: user.login, accessToken: access_token, expiresAt });
      saveTokens(validTokens);
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

  // 방장 레포 목록 반환
  if (url.pathname === '/auth/repos') {
    const token = url.searchParams.get('token');
    if (!token || !validTokens.has(token)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ repos: [] }));
      return;
    }
    // validTokens에 accessToken도 저장해야 하므로 아래에서 수정
    const { accessToken } = validTokens.get(token);
    try {
      // 본인 레포 + 속한 org 레포 전부
      const r = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member', {
        headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'Team-Pulse' },
      });
      const data = await r.json();
      const repos = Array.isArray(data) ? data.map(r => r.full_name) : [];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ repos }));
    } catch {
      res.writeHead(500);
      res.end(JSON.stringify({ repos: [] }));
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

  // ── 랜딩 페이지 ──────────────────────────────────
  if (url.pathname === '/' || url.pathname === '') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Team Pulse</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#0d0d14;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;min-height:100vh}
  a{color:inherit;text-decoration:none}
  nav{display:flex;align-items:center;justify-content:space-between;padding:20px 48px;border-bottom:1px solid #ffffff0f}
  .logo{display:flex;align-items:center;gap:12px;font-size:18px;font-weight:700}
  .logo-icon{width:36px;height:36px;background:#7c3aed;border-radius:10px;display:flex;align-items:center;justify-content:center}
  .logo-icon svg{width:22px;height:22px}
  nav a.btn{padding:8px 18px;background:#7c3aed;border-radius:8px;font-size:14px;font-weight:600;transition:opacity .15s}
  nav a.btn:hover{opacity:.85}
  .hero{text-align:center;padding:100px 24px 80px}
  .badge{display:inline-block;padding:4px 14px;background:#7c3aed22;border:1px solid #7c3aed55;border-radius:99px;font-size:13px;color:#a78bfa;margin-bottom:24px}
  h1{font-size:clamp(36px,6vw,72px);font-weight:800;line-height:1.1;letter-spacing:-2px;margin-bottom:20px}
  h1 span{color:#7c3aed}
  .sub{font-size:18px;color:#ffffff80;max-width:520px;margin:0 auto 40px;line-height:1.6}
  .btns{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
  .btns a{padding:14px 28px;border-radius:12px;font-size:15px;font-weight:700;transition:all .15s}
  .btns .primary{background:#7c3aed;color:#fff}
  .btns .primary:hover{background:#6d28d9}
  .btns .secondary{border:1px solid #ffffff20;color:#ffffffcc}
  .btns .secondary:hover{border-color:#ffffff40;background:#ffffff08}
  .preview{max-width:900px;margin:60px auto;padding:0 24px}
  .preview-card{background:#13131f;border:1px solid #ffffff0f;border-radius:20px;padding:24px;overflow:hidden}
  .preview-bar{display:flex;gap:6px;margin-bottom:20px}
  .preview-bar span{width:12px;height:12px;border-radius:50%}
  .preview-bar .r{background:#ff5f57} .preview-bar .y{background:#febc2e} .preview-bar .g{background:#28c840}
  .members{display:flex;flex-direction:column;gap:10px}
  .member{display:flex;align-items:center;gap:12px;padding:12px 16px;background:#1a1a2e;border-radius:12px}
  .avatar{width:36px;height:36px;border-radius:50%;background:#7c3aed;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;flex-shrink:0}
  .member-info{flex:1;min-width:0}
  .member-name{font-size:14px;font-weight:600}
  .member-file{font-size:12px;color:#ffffff50;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
  .dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
  .dot.online{background:#22c55e} .dot.away{background:#f59e0b} .dot.offline{background:#6b7280}
  .features{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px;max-width:900px;margin:0 auto;padding:0 24px 80px}
  .feat{background:#13131f;border:1px solid #ffffff0f;border-radius:16px;padding:28px}
  .feat-icon{width:44px;height:44px;background:#7c3aed22;border-radius:12px;display:flex;align-items:center;justify-content:center;margin-bottom:16px;font-size:22px}
  .feat h3{font-size:16px;font-weight:700;margin-bottom:8px}
  .feat p{font-size:14px;color:#ffffff60;line-height:1.6}
  .install{text-align:center;padding:60px 24px;background:#7c3aed11;border-top:1px solid #7c3aed22}
  .install h2{font-size:32px;font-weight:800;margin-bottom:12px}
  .install p{color:#ffffff70;margin-bottom:32px}
  .steps{display:flex;gap:16px;justify-content:center;flex-wrap:wrap;max-width:700px;margin:0 auto 36px}
  .step{background:#13131f;border:1px solid #ffffff0f;border-radius:12px;padding:16px 20px;text-align:left;flex:1;min-width:180px}
  .step-num{font-size:12px;color:#7c3aed;font-weight:700;margin-bottom:6px}
  .step p{font-size:13px;color:#ffffffcc;line-height:1.5}
  footer{text-align:center;padding:24px;border-top:1px solid #ffffff0f;color:#ffffff30;font-size:13px}
  footer a{color:#7c3aed}
</style>
</head>
<body>
<nav>
  <div class="logo">
    <div class="logo-icon">
      <svg viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
        <polyline points="1,11 4,11 6.5,4 9,18 11,7 13,14 15.5,8 18,11 21,11" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>
    Team Pulse
  </div>
  <a href="https://marketplace.visualstudio.com/items?itemName=IMJEMIN.teamPulse" class="btn" target="_blank">설치하기</a>
</nav>

<section class="hero">
  <div class="badge">VS Code Extension</div>
  <h1>팀원이 지금<br><span>뭘 하는지</span> 보여요</h1>
  <p class="sub">Team Pulse는 팀원의 실시간 코딩 활동을 VS Code 사이드바에서 바로 확인할 수 있는 확장 프로그램이에요.</p>
  <div class="btns">
    <a href="https://marketplace.visualstudio.com/items?itemName=IMJEMIN.teamPulse" class="primary" target="_blank">VS Code에 설치하기</a>
    <a href="https://github.com/gunobo/Team-Pulse" class="secondary" target="_blank">GitHub 보기</a>
  </div>
</section>

<div class="preview">
  <div class="preview-card">
    <div class="preview-bar"><span class="r"></span><span class="y"></span><span class="g"></span></div>
    <div class="members">
      <div class="member"><div class="avatar">J</div><div class="member-info"><div class="member-name">jemin</div><div class="member-file">src/components/Dashboard.tsx</div></div><div class="dot online"></div></div>
      <div class="member"><div class="avatar" style="background:#2563eb">S</div><div class="member-info"><div class="member-name">sujin</div><div class="member-file">server/index.js</div></div><div class="dot online"></div></div>
      <div class="member"><div class="avatar" style="background:#059669">M</div><div class="member-info"><div class="member-name">minho</div><div class="member-file">잠시 자리 비움</div></div><div class="dot away"></div></div>
    </div>
  </div>
</div>

<section class="features">
  <div class="feat"><div class="feat-icon">⚡</div><h3>실시간 동기화</h3><p>팀원이 파일을 열거나 바꿀 때마다 WebSocket으로 즉시 반영돼요.</p></div>
  <div class="feat"><div class="feat-icon">🔐</div><h3>GitHub OAuth</h3><p>GitHub 계정으로 로그인하고, 특정 레포 collaborator만 방에 입장할 수 있어요.</p></div>
  <div class="feat"><div class="feat-icon">🏠</div><h3>방 코드 시스템</h3><p>8자리 초대 코드로 팀을 구성해요. 30일 후 자동 만료돼요.</p></div>
  <div class="feat"><div class="feat-icon">🔒</div><h3>경로 비공개</h3><p>절대 경로 대신 워크스페이스 기준 상대 경로만 공유해 개인 정보를 지켜요.</p></div>
</section>

<section class="install">
  <h2>5분이면 팀 연결 완료</h2>
  <p>설치부터 팀원과 연결까지 단 4단계예요.</p>
  <div class="steps">
    <div class="step"><div class="step-num">STEP 1</div><p>VS Code 마켓플레이스에서 Team Pulse 설치</p></div>
    <div class="step"><div class="step-num">STEP 2</div><p>사이드바 아이콘 클릭 → Connect → GitHub 로그인</p></div>
    <div class="step"><div class="step-num">STEP 3</div><p>방 만들고 초대 코드를 팀원에게 공유</p></div>
    <div class="step"><div class="step-num">STEP 4</div><p>팀원은 코드 입력 후 바로 연결 완료!</p></div>
  </div>
  <div class="btns">
    <a href="https://marketplace.visualstudio.com/items?itemName=IMJEMIN.teamPulse" class="primary" target="_blank">지금 설치하기 →</a>
  </div>
</section>

<footer>
  <p>Made by <a href="https://github.com/gunobo" target="_blank">IMJEMIN</a> · <a href="https://github.com/gunobo/Team-Pulse" target="_blank">GitHub</a> · MIT License</p>
</footer>
</body>
</html>`);
    return;
  }

  // ── 어드민 API ────────────────────────────────────
  if (url.pathname === '/admin/api' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    await new Promise(r => req.on('end', r));
    let pw;
    try { pw = JSON.parse(body).pw; } catch { pw = ''; }
    if (pw !== ADMIN_PASSWORD) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '비밀번호가 틀렸어요.' }));
      return;
    }
    const now = Date.now();
    const roomList = Object.entries(rooms).map(([code, room]) => ({
      code,
      name: room.name,
      repo: room.repo,
      createdBy: room.createdBy,
      createdAt: room.createdAt,
      expiresAt: room.expiresAt,
      online: sessions[code] ? sessions[code].size : 0,
      members: sessions[code] ? [...sessions[code].values()].map(c => ({
        name: c.member.name,
        status: c.member.status,
        file: c.member.file,
      })) : [],
    }));
    const tokenList = [...validTokens.entries()].map(([, data]) => ({
      login: data.login,
      expiresAt: data.expiresAt,
    }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      rooms: roomList,
      totalRooms: roomList.length,
      totalOnline: Object.values(sessions).reduce((s, m) => s + m.size, 0),
      totalTokens: validTokens.size,
      tokens: tokenList,
      uptime: process.uptime(),
      now,
    }));
    return;
  }

  // ── 어드민 페이지 ─────────────────────────────────
  if (url.pathname === '/admin') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Team Pulse Admin</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#0d0d14;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;min-height:100vh}
  nav{display:flex;align-items:center;justify-content:space-between;padding:16px 32px;border-bottom:1px solid #ffffff0f}
  .logo{display:flex;align-items:center;gap:10px;font-size:16px;font-weight:700}
  .badge{padding:3px 10px;background:#7c3aed33;border:1px solid #7c3aed55;border-radius:99px;font-size:11px;color:#a78bfa}
  #login{display:flex;align-items:center;justify-content:center;min-height:80vh;padding:24px}
  .login-box{background:#13131f;border:1px solid #ffffff0f;border-radius:20px;padding:40px;width:100%;max-width:360px;text-align:center}
  .login-box h2{font-size:20px;font-weight:700;margin-bottom:8px}
  .login-box p{font-size:13px;color:#ffffff50;margin-bottom:28px}
  input[type=password]{width:100%;padding:12px 16px;background:#0d0d14;border:1px solid #ffffff15;border-radius:10px;color:#fff;font-size:14px;outline:none;margin-bottom:12px}
  input[type=password]:focus{border-color:#7c3aed}
  button{width:100%;padding:12px;background:#7c3aed;border:none;border-radius:10px;color:#fff;font-size:14px;font-weight:700;cursor:pointer;transition:opacity .15s}
  button:hover{opacity:.85}
  #dashboard{display:none;padding:24px 32px;max-width:1100px;margin:0 auto}
  .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px;margin-bottom:28px}
  .stat{background:#13131f;border:1px solid #ffffff0f;border-radius:14px;padding:20px}
  .stat-val{font-size:32px;font-weight:800;color:#a78bfa}
  .stat-label{font-size:12px;color:#ffffff50;margin-top:4px}
  h2.section{font-size:16px;font-weight:700;margin-bottom:14px;color:#ffffffcc}
  .rooms{display:flex;flex-direction:column;gap:12px;margin-bottom:32px}
  .room{background:#13131f;border:1px solid #ffffff0f;border-radius:14px;padding:18px 20px}
  .room-header{display:flex;align-items:center;gap:10px;margin-bottom:10px}
  .room-code{font-size:12px;font-family:monospace;background:#7c3aed22;color:#a78bfa;padding:3px 8px;border-radius:6px}
  .room-name{font-size:15px;font-weight:700}
  .room-meta{font-size:12px;color:#ffffff40;margin-left:auto}
  .room-members{display:flex;flex-wrap:wrap;gap:8px}
  .room-member{display:flex;align-items:center;gap:6px;padding:5px 10px;background:#1a1a2e;border-radius:8px;font-size:12px}
  .dot{width:7px;height:7px;border-radius:50%}
  .dot.online{background:#22c55e} .dot.away{background:#f59e0b} .dot.offline{background:#6b7280}
  .tokens{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px}
  .token{background:#13131f;border:1px solid #ffffff0f;border-radius:10px;padding:12px 16px}
  .token-name{font-size:13px;font-weight:600}
  .token-exp{font-size:11px;color:#ffffff40;margin-top:3px}
  .uptime{font-size:12px;color:#ffffff40}
  .empty{color:#ffffff30;font-size:13px;padding:16px 0}
  .refresh-btn{padding:7px 16px;background:transparent;border:1px solid #ffffff20;border-radius:8px;color:#ffffffcc;font-size:12px;width:auto;margin-bottom:20px}
</style>
</head>
<body>
<nav>
  <div class="logo">
    <svg width="24" height="24" viewBox="0 0 22 22" fill="none"><polyline points="1,11 4,11 6.5,4 9,18 11,7 13,14 15.5,8 18,11 21,11" stroke="#a78bfa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    Team Pulse
  </div>
  <span class="badge">Admin</span>
</nav>

<div id="login">
  <div class="login-box">
    <h2>어드민 로그인</h2>
    <p>비밀번호를 입력하세요</p>
    <input type="password" id="pw" placeholder="비밀번호" onkeydown="if(event.key==='Enter')login()">
    <button onclick="login()">로그인</button>
    <p id="err" style="color:#f87171;font-size:12px;margin-top:10px"></p>
  </div>
</div>

<div id="dashboard">
  <button class="refresh-btn" onclick="load()">↻ 새로고침</button>
  <div class="stats" id="stats"></div>
  <h2 class="section">활성 방</h2>
  <div class="rooms" id="rooms"></div>
  <h2 class="section">인증된 유저</h2>
  <div class="tokens" id="tokens"></div>
</div>

<script>
let pw = '';
function login() {
  pw = document.getElementById('pw').value;
  load();
}
function fmt(ms) {
  const d = new Date(ms);
  return d.toLocaleDateString('ko-KR') + ' ' + d.toLocaleTimeString('ko-KR', {hour:'2-digit',minute:'2-digit'});
}
function fmtUp(s) {
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60);
  return h + '시간 ' + m + '분';
}
async function load() {
  const r = await fetch('/admin/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pw }) });
  if (!r.ok) { document.getElementById('err').textContent = '비밀번호가 틀렸어요.'; return; }
  const d = await r.json();
  document.getElementById('login').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';

  document.getElementById('stats').innerHTML = \`
    <div class="stat"><div class="stat-val">\${d.totalRooms}</div><div class="stat-label">전체 방</div></div>
    <div class="stat"><div class="stat-val">\${d.totalOnline}</div><div class="stat-label">현재 접속자</div></div>
    <div class="stat"><div class="stat-val">\${d.totalTokens}</div><div class="stat-label">인증된 유저</div></div>
    <div class="stat"><div class="stat-val" style="font-size:20px">\${fmtUp(d.uptime)}</div><div class="stat-label">서버 업타임</div></div>
  \`;

  document.getElementById('rooms').innerHTML = d.rooms.length ? d.rooms.map(room => \`
    <div class="room">
      <div class="room-header">
        <span class="room-code">\${room.code}</span>
        <span class="room-name">\${room.name}</span>
        \${room.repo ? \`<span style="font-size:12px;color:#7c3aed">🔒 \${room.repo}</span>\` : ''}
        <span class="room-meta">by \${room.createdBy} · \${room.online}명 온라인 · 만료 \${fmt(room.expiresAt)}</span>
      </div>
      <div class="room-members">
        \${room.members.length ? room.members.map(m => \`
          <div class="room-member">
            <div class="dot \${m.status}"></div>
            <span>\${m.name}</span>
            \${m.file ? \`<span style="color:#ffffff40">\${m.file}</span>\` : ''}
          </div>
        \`).join('') : '<span style="color:#ffffff30;font-size:12px">접속자 없음</span>'}
      </div>
    </div>
  \`).join('') : '<p class="empty">활성 방이 없어요.</p>';

  document.getElementById('tokens').innerHTML = d.tokens.length ? d.tokens.map(t => \`
    <div class="token">
      <div class="token-name">@\${t.login}</div>
      <div class="token-exp">만료: \${fmt(t.expiresAt)}</div>
    </div>
  \`).join('') : '<p class="empty">인증된 유저가 없어요.</p>';
}
</script>
</body>
</html>`);
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

httpServer.listen(PORT, () => {
  console.log(`\nTeam Pulse server  →  ws://localhost:${PORT}`);
  console.log(`OAuth callback     →  http://localhost:${PORT}/auth/callback`);
  console.log(`Repo 제한          →  per-room`);
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

    if (msg.type === 'createRoom' || msg.type === 'joinRoom') {
      const tokenData = validTokens.get(msg.token);
      if (!tokenData) {
        send(ws, { type: 'error', message: 'GitHub 인증이 필요해요.', code: 'AUTH_REQUIRED' });
        ws.close();
        return;
      }
      if (Date.now() > tokenData.expiresAt) {
        validTokens.delete(msg.token);
        send(ws, { type: 'error', message: '로그인이 만료됐어요. 다시 로그인해주세요.', code: 'TOKEN_EXPIRED' });
        ws.close();
        return;
      }
    }

    const githubLogin = validTokens.get(msg.token)?.login;

    // ── 방 생성 ────────────────────────────────────
    if (msg.type === 'createRoom') {
      const code = generateCode();
      rooms[code] = {
        name:      msg.roomName?.trim() || `${githubLogin}의 방`,
        repo:      msg.repo?.trim() || null,
        createdBy: githubLogin,
        createdAt: Date.now(),
        expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
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
      if (rooms[code].expiresAt && Date.now() > rooms[code].expiresAt) {
        delete rooms[code];
        saveRooms(rooms);
        return send(ws, { type: 'error', message: '방이 만료됐어요. 새로 만들어주세요.', code: 'ROOM_EXPIRED' });
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
