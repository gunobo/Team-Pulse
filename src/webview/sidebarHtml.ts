import * as vscode from 'vscode';

export function getSidebarHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = getNonce();

  return /* html */ `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Team Pulse</title>
  <style nonce="${nonce}">
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      height: 100vh;
      display: flex;
      flex-direction: column;
    }

    .header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border, #ffffff10);
      flex-shrink: 0;
    }
    .header-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: var(--vscode-sideBarSectionHeader-foreground);
      flex: 1;
    }
    .status-dot {
      width: 7px; height: 7px;
      border-radius: 50%;
      background: #ef4444;
      flex-shrink: 0;
    }
    .status-dot.connected { background: #22c55e; animation: pulse 2s infinite; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }

    .screen { flex: 1; overflow-y: auto; padding: 16px 12px; display: none; flex-direction: column; gap: 10px; }
    .screen.active { display: flex; }

    /* HOME */
    .welcome { text-align: center; padding: 20px 0 12px; }
    .welcome-icon { font-size: 32px; margin-bottom: 8px; }
    .welcome-title { font-size: 13px; font-weight: 700; margin-bottom: 4px; }
    .welcome-sub { font-size: 11px; color: var(--vscode-descriptionForeground); line-height: 1.5; }

    .action-btn {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 10px 12px;
      background: var(--vscode-button-secondaryBackground, #2a2d2e);
      color: var(--vscode-button-secondaryForeground, #ccc);
      border: 1px solid var(--vscode-button-border, #ffffff15);
      border-radius: 6px;
      cursor: pointer;
      text-align: left;
      transition: background 0.15s;
      font-size: 12px;
      font-family: var(--vscode-font-family);
    }
    .action-btn:hover { background: var(--vscode-list-hoverBackground); }
    .action-btn .btn-icon { font-size: 16px; flex-shrink: 0; }
    .action-btn .btn-text { flex: 1; }
    .action-btn .btn-label { font-weight: 600; display: block; }
    .action-btn .btn-desc { font-size: 10px; color: var(--vscode-descriptionForeground); margin-top: 1px; display: block; }

    .primary-btn {
      width: 100%;
      padding: 8px;
      background: #6366f1;
      color: #fff;
      border: none;
      border-radius: 5px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      font-family: var(--vscode-font-family);
      transition: background 0.15s;
    }
    .primary-btn:hover { background: #4f46e5; }
    .primary-btn:disabled { opacity: 0.5; cursor: default; }

    .back-btn {
      background: none;
      border: none;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      cursor: pointer;
      padding: 0;
      font-family: var(--vscode-font-family);
      display: flex;
      align-items: center;
      gap: 4px;
      margin-bottom: 4px;
    }
    .back-btn:hover { color: var(--vscode-foreground); }

    .form-label {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 4px;
      display: block;
    }
    .form-input {
      width: 100%;
      padding: 6px 10px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, #ffffff20);
      border-radius: 4px;
      font-size: 12px;
      font-family: var(--vscode-font-family);
      outline: none;
    }
    .form-input:focus { border-color: #6366f1; }
    .form-hint { font-size: 10px; color: var(--vscode-descriptionForeground); margin-top: 3px; }
    .form-group { display: flex; flex-direction: column; }

    .screen-title { font-size: 13px; font-weight: 700; margin-bottom: 2px; }
    .screen-sub { font-size: 11px; color: var(--vscode-descriptionForeground); margin-bottom: 4px; }

    /* CONNECTED */
    .room-badge {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 10px;
      background: #6366f115;
      border: 1px solid #6366f130;
      border-radius: 6px;
      flex-shrink: 0;
    }
    .room-info { font-size: 11px; }
    .room-name { font-weight: 700; }
    .room-code { font-size: 10px; color: var(--vscode-descriptionForeground); font-family: monospace; letter-spacing: 1px; }
    .copy-btn {
      background: none; border: none; cursor: pointer;
      color: var(--vscode-descriptionForeground); font-size: 12px; padding: 2px 6px;
      border-radius: 4px;
    }
    .copy-btn:hover { background: var(--vscode-list-hoverBackground); color: var(--vscode-foreground); }

    .section-label {
      font-size: 10px; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.6px; color: var(--vscode-descriptionForeground);
    }

    .member-card {
      display: flex; align-items: center; gap: 8px;
      padding: 6px 6px; border-radius: 5px; cursor: default;
      transition: background 0.15s;
    }
    .member-card:hover { background: var(--vscode-list-hoverBackground); }
    .avatar {
      width: 26px; height: 26px; border-radius: 50%;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; font-weight: 700; color: #fff;
      flex-shrink: 0; position: relative;
    }
    .avatar-badge {
      position: absolute; bottom: -1px; right: -1px;
      width: 8px; height: 8px; border-radius: 50%;
      border: 1.5px solid var(--vscode-sideBar-background, #1e1e1e);
    }
    .badge-online{background:#22c55e} .badge-away{background:#f59e0b} .badge-offline{background:#6b7280}
    .member-info { flex: 1; min-width: 0; }
    .member-name { font-size: 11px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .member-file { font-size: 10px; color: var(--vscode-descriptionForeground); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px; }

    .disconnect-btn {
      width: 100%; padding: 6px; background: none;
      color: var(--vscode-descriptionForeground);
      border: 1px solid var(--vscode-button-border, #ffffff15);
      border-radius: 5px; font-size: 11px; cursor: pointer;
      font-family: var(--vscode-font-family); margin-top: 4px;
    }
    .disconnect-btn:hover { background: var(--vscode-list-hoverBackground); }

    .error-msg { font-size: 11px; color: #f87171; text-align: center; padding: 4px 0; }
  </style>
</head>
<body>
  <div class="header">
    <div class="status-dot" id="statusDot"></div>
    <span class="header-title">Team Pulse</span>
  </div>

  <!-- 로그인 -->
  <div class="screen active" id="screen-login">
    <div class="welcome">
      <div class="welcome-icon">⚡</div>
      <div class="welcome-title">Team Pulse</div>
      <div class="welcome-sub">GitHub로 로그인하고<br>팀원과 연결해요</div>
    </div>
    <button class="primary-btn" onclick="doLogin()">GitHub로 로그인</button>
  </div>

  <!-- 로그인 중 -->
  <div class="screen" id="screen-logging-in">
    <div class="welcome">
      <div class="welcome-icon">⏳</div>
      <div class="welcome-title">로그인 중...</div>
      <div class="welcome-sub">브라우저에서 GitHub<br>로그인을 완료해주세요</div>
    </div>
  </div>

  <!-- 홈 -->
  <div class="screen" id="screen-home">
    <div class="welcome">
      <div class="welcome-icon">👋</div>
      <div class="welcome-title" id="welcome-name"></div>
      <div class="welcome-sub">팀과 연결할 방을 선택해요</div>
    </div>
    <button class="action-btn" onclick="showScreen('screen-create')">
      <span class="btn-icon">＋</span>
      <span class="btn-text">
        <span class="btn-label">새 방 만들기</span>
        <span class="btn-desc">초대 코드를 팀원에게 공유해요</span>
      </span>
    </button>
    <button class="action-btn" onclick="showScreen('screen-join')">
      <span class="btn-icon">🔑</span>
      <span class="btn-text">
        <span class="btn-label">초대 코드로 참가</span>
        <span class="btn-desc">팀원에게 받은 코드를 입력해요</span>
      </span>
    </button>
    <button class="disconnect-btn" style="margin-top:auto" onclick="doLogout()">로그아웃</button>
  </div>

  <!-- 방 만들기 -->
  <div class="screen" id="screen-create">
    <button class="back-btn" onclick="showScreen('screen-home')">← 뒤로</button>
    <div class="screen-title">새 방 만들기</div>
    <div class="screen-sub">방 정보를 입력하세요</div>
    <div class="form-group">
      <label class="form-label">방 이름</label>
      <input class="form-input" id="input-roomName" placeholder="우리 팀" maxlength="30">
    </div>
    <div class="form-group">
      <label class="form-label">GitHub 레포 제한 <span style="font-weight:400;text-transform:none">(선택)</span></label>
      <input class="form-input" id="input-repo" placeholder="owner/repo-name">
      <span class="form-hint">입력하면 해당 collaborator만 입장 가능해요</span>
    </div>
    <div id="create-error" class="error-msg"></div>
    <button class="primary-btn" onclick="doCreate()">방 만들기</button>
  </div>

  <!-- 참가 -->
  <div class="screen" id="screen-join">
    <button class="back-btn" onclick="showScreen('screen-home')">← 뒤로</button>
    <div class="screen-title">초대 코드로 참가</div>
    <div class="screen-sub">팀원에게 받은 코드를 입력하세요</div>
    <div class="form-group">
      <label class="form-label">초대 코드</label>
      <input class="form-input" id="input-code" placeholder="A1B2C3D4" maxlength="8"
        style="text-transform:uppercase;letter-spacing:2px;font-family:monospace"
        oninput="this.value=this.value.toUpperCase()">
    </div>
    <div id="join-error" class="error-msg"></div>
    <button class="primary-btn" onclick="doJoin()">참가하기</button>
  </div>

  <!-- 연결됨 -->
  <div class="screen" id="screen-connected">
    <div class="room-badge">
      <div class="room-info">
        <div class="room-name" id="roomNameDisplay"></div>
        <div class="room-code" id="roomCodeDisplay"></div>
      </div>
      <button class="copy-btn" onclick="copyCode()" title="코드 복사">📋</button>
    </div>
    <div class="section-label" id="onlineLabel">Online — 0</div>
    <div id="memberList"></div>
    <button class="disconnect-btn" onclick="doDisconnect()">연결 끊기</button>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let currentRoomCode = '';
    let isLoggedIn = false;

    function showScreen(id) {
      document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
      document.getElementById(id).classList.add('active');
    }

    function doLogin() {
      vscode.postMessage({ type: 'login' });
    }

    function doLogout() {
      isLoggedIn = false;
      vscode.postMessage({ type: 'logout' });
      showScreen('screen-login');
      document.getElementById('statusDot').classList.remove('connected');
    }

    function doCreate() {
      const roomName = document.getElementById('input-roomName').value.trim();
      const repo = document.getElementById('input-repo').value.trim();
      document.getElementById('create-error').textContent = '';
      vscode.postMessage({ type: 'createRoom', roomName: roomName || '우리 팀', repo: repo || null });
    }

    function doJoin() {
      const code = document.getElementById('input-code').value.trim().toUpperCase();
      if (code.length < 4) {
        document.getElementById('join-error').textContent = '코드를 입력해주세요.';
        return;
      }
      document.getElementById('join-error').textContent = '';
      vscode.postMessage({ type: 'joinRoom', code });
    }

    function doDisconnect() {
      vscode.postMessage({ type: 'disconnect' });
      showScreen('screen-home');
      document.getElementById('statusDot').classList.remove('connected');
    }

    function copyCode() {
      vscode.postMessage({ type: 'copyCode', code: currentRoomCode });
    }

    window.addEventListener('message', (event) => {
      const msg = event.data;
      switch (msg.type) {
        case 'init':
          if (msg.login) {
            isLoggedIn = true;
            document.getElementById('welcome-name').textContent = msg.login + ' 님, 안녕하세요!';
            if (msg.remote) {
              document.getElementById('input-repo').value = msg.remote;
            }
            showScreen('screen-home');
          } else {
            isLoggedIn = false;
            showScreen('screen-login');
          }
          break;
        case 'loggingIn':
          showScreen('screen-logging-in');
          break;
        case 'loginFailed':
          showScreen('screen-login');
          break;
        case 'connected':
          document.getElementById('statusDot').classList.add('connected');
          break;
        case 'disconnected':
          document.getElementById('statusDot').classList.remove('connected');
          if (isLoggedIn) showScreen('screen-home');
          else showScreen('screen-login');
          break;
        case 'roomCreated':
        case 'welcome':
          currentRoomCode = msg.code || msg.roomCode || '';
          document.getElementById('roomNameDisplay').textContent = msg.roomName || '방';
          document.getElementById('roomCodeDisplay').textContent = currentRoomCode;
          document.getElementById('statusDot').classList.add('connected');
          showScreen('screen-connected');
          break;
        case 'membersUpdate':
          renderMembers(msg.members);
          break;
        case 'error':
          if (msg.code === 'TOKEN_EXPIRED' || msg.code === 'AUTH_REQUIRED') {
            isLoggedIn = false;
            showScreen('screen-login');
          }
          const errEl = document.getElementById('join-error') || document.getElementById('create-error');
          if (errEl) errEl.textContent = msg.message;
          break;
        case 'restore':
          currentRoomCode = msg.code || '';
          document.getElementById('roomNameDisplay').textContent = msg.roomName || '방';
          document.getElementById('roomCodeDisplay').textContent = currentRoomCode;
          document.getElementById('statusDot').classList.add('connected');
          showScreen('screen-connected');
          renderMembers(msg.members || []);
          break;
      }
    });

    function renderMembers(members) {
      const online = members.filter(m => m.status !== 'offline');
      const offline = members.filter(m => m.status === 'offline');
      document.getElementById('onlineLabel').textContent = 'Online — ' + online.length;
      document.getElementById('memberList').innerHTML =
        online.map(memberCard).join('') +
        (offline.length ? '<div class="section-label" style="margin-top:8px">Offline — ' + offline.length + '</div>' + offline.map(memberCard).join('') : '');
    }

    function memberCard(m) {
      const initial = (m.name || '?')[0].toUpperCase();
      const fileLabel = m.file ? m.file.split('/').pop() : '—';
      return \`<div class="member-card">
        <div class="avatar">\${initial}<div class="avatar-badge badge-\${m.status}"></div></div>
        <div class="member-info">
          <div class="member-name">\${m.name}</div>
          <div class="member-file">\${fileLabel}</div>
        </div>
      </div>\`;
    }

    // 웹뷰 로드 완료 → 확장에 ready 전송
    window.addEventListener('load', () => {
      vscode.postMessage({ type: 'ready' });
    });
  </script>
</body>
</html>`;
}

function getNonce() {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) text += chars.charAt(Math.floor(Math.random() * chars.length));
  return text;
}
