import { WebSocketServer, WebSocket } from 'ws';
import { randomBytes } from 'crypto';

const PORT       = process.env.PORT || 4001;
const ADMIN_KEY  = process.env.ADMIN_KEY || 'imjemin-admin'; // 관리자 키
const wss        = new WebSocketServer({ port: PORT });

// 유효한 초대 코드 목록: code → { label, usedBy, maxUse, createdAt }
const inviteCodes = new Map();

// 접속 중인 멤버: clientId → { ws, member }
const clients = new Map();

let nextId = 1;

// ── 초대 코드 생성 ────────────────────────────────
function createInviteCode(label = '', maxUse = 1) {
  const code = randomBytes(4).toString('hex').toUpperCase(); // 예: A3F7B2C1
  inviteCodes.set(code, { label, usedBy: [], maxUse, createdAt: Date.now() });
  return code;
}

// 기본 코드 하나 생성 (서버 시작 시)
const defaultCode = createInviteCode('default', 99);
console.log(`\n🔑 초대 코드: ${defaultCode}  (관리자가 팀원에게 공유)\n`);

// ── WebSocket ─────────────────────────────────────
wss.on('connection', (ws) => {
  const clientId = String(nextId++);
  let authenticated = false;

  // 5초 안에 인증 안 하면 강제 종료
  const authTimer = setTimeout(() => {
    if (!authenticated) {
      send(ws, { type: 'error', message: '인증 시간 초과' });
      ws.close();
    }
  }, 5000);

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    // ── 관리자 명령 ──────────────────────────────
    if (msg.type === 'admin') {
      if (msg.adminKey !== ADMIN_KEY) {
        send(ws, { type: 'error', message: '관리자 키 틀림' });
        return;
      }
      switch (msg.cmd) {
        case 'createCode': {
          const code = createInviteCode(msg.label || '', msg.maxUse || 1);
          send(ws, { type: 'adminResult', code, label: msg.label });
          console.log(`[admin] 새 초대 코드 생성: ${code} (${msg.label || ''})`);
          break;
        }
        case 'listCodes': {
          const list = [...inviteCodes.entries()].map(([code, v]) => ({
            code, ...v
          }));
          send(ws, { type: 'adminResult', codes: list });
          break;
        }
        case 'revokeCode': {
          inviteCodes.delete(msg.code);
          send(ws, { type: 'adminResult', revoked: msg.code });
          console.log(`[admin] 코드 삭제: ${msg.code}`);
          break;
        }
        case 'kickMember': {
          const target = [...clients.values()].find(c => c.member.name === msg.name);
          if (target) {
            send(target.ws, { type: 'error', message: '관리자에 의해 연결이 끊겼습니다.' });
            target.ws.close();
          }
          break;
        }
      }
      return;
    }

    // ── 일반 클라이언트: 인증 전 ─────────────────
    if (!authenticated) {
      if (msg.type !== 'join') return;

      const invite = inviteCodes.get(msg.code);

      if (!invite) {
        send(ws, { type: 'error', message: '유효하지 않은 초대 코드예요.' });
        ws.close();
        return;
      }
      if (invite.usedBy.length >= invite.maxUse) {
        send(ws, { type: 'error', message: '초대 코드 사용 횟수를 초과했어요.' });
        ws.close();
        return;
      }
      if (!msg.name || msg.name.trim() === '') {
        send(ws, { type: 'error', message: '이름을 입력해주세요.' });
        ws.close();
        return;
      }

      // 같은 이름 중복 차단
      const duplicate = [...clients.values()].find(c => c.member.name === msg.name.trim());
      if (duplicate) {
        send(ws, { type: 'error', message: `이미 "${msg.name}" 이름으로 접속 중인 사람이 있어요.` });
        ws.close();
        return;
      }

      // 인증 성공
      clearTimeout(authTimer);
      authenticated = true;
      invite.usedBy.push(msg.name);

      const member = {
        id:     clientId,
        name:   msg.name.trim(),
        status: 'online',
        file:   null,
        branch: msg.branch || null,
      };
      clients.set(clientId, { ws, member });

      send(ws, { type: 'welcome', id: clientId });
      send(ws, { type: 'members', members: getMemberList() });
      broadcast({ type: 'memberJoined', member }, clientId);
      console.log(`[+] ${member.name} 접속 (코드: ${msg.code})`);
      return;
    }

    // ── 인증된 클라이언트 메시지 처리 ────────────
    switch (msg.type) {
      case 'fileOpen': {
        const entry = clients.get(clientId);
        if (!entry) break;
        entry.member.file = msg.file;
        broadcast({ type: 'memberUpdated', member: entry.member });
        break;
      }
      case 'statusChange': {
        const entry = clients.get(clientId);
        if (!entry) break;
        entry.member.status = msg.status;
        broadcast({ type: 'memberUpdated', member: entry.member });
        break;
      }
      case 'notify': {
        const target = [...clients.values()].find(c => c.member.name === msg.to);
        if (target) {
          send(target.ws, {
            type: 'notification',
            from: clients.get(clientId)?.member.name,
            message: msg.message,
          });
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    const entry = clients.get(clientId);
    if (entry) {
      console.log(`[-] ${entry.member.name} 퇴장`);
      clients.delete(clientId);
      broadcast({ type: 'memberLeft', id: clientId });
    }
    clearTimeout(authTimer);
  });

  ws.on('error', (err) => console.error(`[!] ${clientId} 오류:`, err.message));
});

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}

function broadcast(data, excludeId = null) {
  const raw = JSON.stringify(data);
  for (const [id, { ws }] of clients) {
    if (id !== excludeId && ws.readyState === WebSocket.OPEN) ws.send(raw);
  }
}

function getMemberList() {
  return [...clients.values()].map(c => c.member);
}

console.log(`Team Pulse server  →  ws://localhost:${PORT}`);
console.log(`관리자 키: ${ADMIN_KEY}`);
