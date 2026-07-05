import * as vscode from 'vscode';

export function getSidebarHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = getNonce();

  return /* html */ `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; img-src https://avatars.githubusercontent.com; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
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
      padding: 6px 6px; border-radius: 5px; cursor: pointer;
      transition: background 0.15s;
    }
    .member-card:hover { background: var(--vscode-list-hoverBackground); }
    .avatar {
      width: 26px; height: 26px; border-radius: 50%;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; font-weight: 700; color: #fff;
      flex-shrink: 0; position: relative; overflow: hidden;
    }
    .avatar img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
    .avatar-badge {
      position: absolute; bottom: -1px; right: -1px;
      width: 8px; height: 8px; border-radius: 50%;
      border: 1.5px solid var(--vscode-sideBar-background, #1e1e1e);
    }
    .badge-online{background:#22c55e} .badge-away{background:#f59e0b} .badge-offline{background:#6b7280}
    .member-info { flex: 1; min-width: 0; }
    .member-name { font-size: 11px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .member-file { font-size: 10px; color: var(--vscode-descriptionForeground); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px; }
    .member-git { font-size: 10px; color: #f59e0b; margin-top: 2px; }
    .member-status-msg { font-size: 10px; color: var(--vscode-descriptionForeground); margin-top: 1px; font-style: italic; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .member-branch { font-size: 9px; color: #6366f1; background: #6366f115; border: 1px solid #6366f130; border-radius: 3px; padding: 0px 4px; margin-left: 4px; font-family: monospace; flex-shrink: 0; }
    .conflict-badge { font-size: 9px; color: #ef4444; margin-left: 4px; flex-shrink: 0; }
    .card-arrow { font-size: 9px; color: var(--vscode-descriptionForeground); flex-shrink: 0; }

    .member-detail {
      display: none; margin: 0 6px 4px 40px;
      background: var(--vscode-input-background);
      border-radius: 4px; padding: 6px 8px;
    }
    .member-detail.open { display: block; }
    .member-detail-title { font-size: 10px; font-weight: 600; color: var(--vscode-descriptionForeground); margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
    .member-detail-file {
      font-size: 10px; color: var(--vscode-foreground);
      padding: 2px 0; display: flex; align-items: center; gap: 5px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .member-detail-file::before { content: '✏'; font-size: 9px; flex-shrink: 0; }
    .member-detail-empty { font-size: 10px; color: var(--vscode-descriptionForeground); }
    .review-btn {
      margin-top: 6px; width: 100%; padding: 4px 8px;
      background: #6366f115; border: 1px solid #6366f130;
      border-radius: 4px; color: #818cf8; font-size: 10px;
      font-weight: 600; cursor: pointer; font-family: var(--vscode-font-family);
    }
    .review-btn:hover { background: #6366f125; }

    .status-msg-wrap { display: flex; gap: 6px; align-items: center; flex-shrink: 0; }
    .status-msg-input {
      flex: 1; padding: 4px 8px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, #ffffff20);
      border-radius: 4px; font-size: 11px;
      font-family: var(--vscode-font-family); outline: none;
    }
    .status-msg-input:focus { border-color: #6366f1; }
    .status-msg-input::placeholder { color: var(--vscode-input-placeholderForeground); }

    .commit-toast {
      display: none; padding: 6px 10px; margin-bottom: 4px;
      background: #10b98115; border: 1px solid #10b98130;
      border-radius: 5px; font-size: 10px; color: #34d399;
    }
    .commit-toast.show { display: block; }

    .disconnect-btn {
      width: 100%; padding: 6px; background: none;
      color: var(--vscode-descriptionForeground);
      border: 1px solid var(--vscode-button-border, #ffffff15);
      border-radius: 5px; font-size: 11px; cursor: pointer;
      font-family: var(--vscode-font-family); margin-top: 4px;
    }
    .disconnect-btn:hover { background: var(--vscode-list-hoverBackground); }

    .reconnect-bar {
      display: none; padding: 6px 12px;
      background: #f59e0b18; border-bottom: 1px solid #f59e0b30;
      font-size: 10px; color: #f59e0b; text-align: center;
    }
    .reconnect-bar.show { display: block; }

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
    <button class="primary-btn" id="btn-login">GitHub로 로그인</button>
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
    <button class="action-btn" id="btn-go-create">
      <span class="btn-icon">＋</span>
      <span class="btn-text">
        <span class="btn-label">새 방 만들기</span>
        <span class="btn-desc">초대 코드를 팀원에게 공유해요</span>
      </span>
    </button>
    <button class="action-btn" id="btn-go-join">
      <span class="btn-icon">🔑</span>
      <span class="btn-text">
        <span class="btn-label">초대 코드로 참가</span>
        <span class="btn-desc">팀원에게 받은 코드를 입력해요</span>
      </span>
    </button>
    <button class="disconnect-btn" style="margin-top:auto" id="btn-logout">로그아웃</button>
  </div>

  <!-- 방 만들기 -->
  <div class="screen" id="screen-create">
    <button class="back-btn" id="btn-back-create">← 뒤로</button>
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
    <button class="primary-btn" id="btn-create">방 만들기</button>
  </div>

  <!-- 참가 -->
  <div class="screen" id="screen-join">
    <button class="back-btn" id="btn-back-join">← 뒤로</button>
    <div class="screen-title">초대 코드로 참가</div>
    <div class="screen-sub">팀원에게 받은 코드를 입력하세요</div>
    <div class="form-group">
      <label class="form-label">초대 코드</label>
      <input class="form-input" id="input-code" placeholder="A1B2C3D4" maxlength="8"
        style="text-transform:uppercase;letter-spacing:2px;font-family:monospace">
    </div>
    <div id="join-error" class="error-msg"></div>
    <button class="primary-btn" id="btn-join">참가하기</button>
  </div>

  <!-- 연결됨 -->
  <div class="screen" id="screen-connected">
    <div class="reconnect-bar" id="reconnect-bar">⟳ 재연결 중...</div>
    <div class="room-badge">
      <div class="room-info">
        <div class="room-name" id="roomNameDisplay"></div>
        <div class="room-code" id="roomCodeDisplay"></div>
      </div>
      <button class="copy-btn" id="btn-copy" title="코드 복사">📋</button>
    </div>
    <div class="commit-toast" id="commitToast"></div>
    <div class="status-msg-wrap">
      <input class="status-msg-input" id="input-statusMsg" placeholder="상태 메시지... (예: 점심 중 🍜)" maxlength="50">
    </div>
    <div class="section-label" id="onlineLabel">Online — 0</div>
    <div id="memberList"></div>
    <button class="disconnect-btn" id="btn-disconnect">연결 끊기</button>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let currentRoomCode = '';
    let isLoggedIn = false;
    let myFile = '';
    let statusMsgTimeout = null;

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
      currentRoomCode = '';
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
          document.getElementById('reconnect-bar')?.classList.remove('show');
          break;
        case 'disconnected':
          document.getElementById('statusDot').classList.remove('connected');
          // 연결된 방이 있으면 홈으로 가지 말고 재연결 바만 표시
          if (currentRoomCode) {
            document.getElementById('reconnect-bar')?.classList.add('show');
          } else if (isLoggedIn) {
            showScreen('screen-home');
          } else {
            showScreen('screen-login');
          }
          break;
        case 'roomCreated':
        case 'welcome':
          currentRoomCode = msg.code || msg.roomCode || '';
          document.getElementById('roomNameDisplay').textContent = msg.roomName || '방';
          document.getElementById('roomCodeDisplay').textContent = currentRoomCode;
          document.getElementById('statusDot').classList.add('connected');
          document.getElementById('reconnect-bar')?.classList.remove('show');
          showScreen('screen-connected');
          break;
        case 'membersUpdate':
          renderMembers(msg.members);
          break;
        case 'myFileUpdate':
          myFile = msg.file || '';
          break;
        case 'memberCommitted': {
          const toast = document.getElementById('commitToast');
          if (toast) {
            toast.textContent = \`📦 \${msg.name}: \${msg.message || '새 커밋'}\`;
            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 5000);
          }
          break;
        }
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
      attachCardListeners();
    }

    const openDetails = new Set();

    function memberCard(m) {
      const fileLabel = m.file ? m.file.split('/').pop() : '—';
      const hasGit = m.modifiedFiles && m.modifiedFiles.length > 0;
      const isOpen = openDetails.has(m.id);
      const avatarUrl = \`https://avatars.githubusercontent.com/\${encodeURIComponent(m.name)}?s=52\`;
      const isConflict = myFile && m.file && myFile === m.file;

      const detailHtml = \`<div class="member-detail \${isOpen ? 'open' : ''}" id="detail-\${m.id}">
        <div class="member-detail-title">수정 중인 파일</div>
        \${hasGit
          ? m.modifiedFiles.map(f => \`<div class="member-detail-file">\${f.split('/').pop()}</div>\`).join('')
          : '<div class="member-detail-empty">변경 없음</div>'
        }
        <button class="review-btn" data-name="\${m.name}" data-file="\${m.file || ''}">🔍 코드 리뷰 요청</button>
      </div>\`;

      return \`<div class="member-card" data-id="\${m.id}">
        <div class="avatar">
          <img src="\${avatarUrl}" alt="\${m.name}" onerror="this.style.display='none'">
          <div class="avatar-badge badge-\${m.status}"></div>
        </div>
        <div class="member-info">
          <div class="member-name" style="display:flex;align-items:center">
            \${m.name}
            \${m.branch ? \`<span class="member-branch">\${m.branch}</span>\` : ''}
            \${isConflict ? \`<span class="conflict-badge" title="같은 파일 작업 중!">⚠️</span>\` : ''}
          </div>
          <div class="member-file">\${fileLabel}</div>
          \${m.statusMsg ? \`<div class="member-status-msg">\${m.statusMsg}</div>\` : ''}
          \${hasGit ? \`<div class="member-git">✏ \${m.modifiedFiles.length}개 수정 중</div>\` : ''}
        </div>
        <span class="card-arrow">\${isOpen ? '▾' : '▸'}</span>
      </div>\${detailHtml}\`;
    }

    function attachCardListeners() {
      document.querySelectorAll('.member-card').forEach(card => {
        card.addEventListener('click', () => {
          const id = card.dataset.id;
          const detail = document.getElementById('detail-' + id);
          const arrow = card.querySelector('.card-arrow');
          if (!detail) return;
          if (openDetails.has(id)) {
            openDetails.delete(id);
            detail.classList.remove('open');
            if (arrow) arrow.textContent = '▸';
          } else {
            openDetails.add(id);
            detail.classList.add('open');
            if (arrow) arrow.textContent = '▾';
          }
        });
      });
      document.querySelectorAll('.review-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          vscode.postMessage({ type: 'reviewRequest', to: btn.dataset.name, file: btn.dataset.file });
        });
      });
    }

    // 버튼 이벤트 바인딩
    document.getElementById('btn-login').addEventListener('click', doLogin);
    document.getElementById('btn-logout').addEventListener('click', doLogout);
    document.getElementById('btn-go-create').addEventListener('click', () => showScreen('screen-create'));
    document.getElementById('btn-go-join').addEventListener('click', () => showScreen('screen-join'));
    document.getElementById('btn-back-create').addEventListener('click', () => showScreen('screen-home'));
    document.getElementById('btn-back-join').addEventListener('click', () => showScreen('screen-home'));
    document.getElementById('btn-create').addEventListener('click', doCreate);
    document.getElementById('btn-join').addEventListener('click', doJoin);
    document.getElementById('btn-disconnect').addEventListener('click', doDisconnect);
    document.getElementById('btn-copy').addEventListener('click', copyCode);
    document.getElementById('input-code').addEventListener('input', function() {
      this.value = this.value.toUpperCase();
    });
    document.getElementById('input-statusMsg').addEventListener('input', function() {
      clearTimeout(statusMsgTimeout);
      statusMsgTimeout = setTimeout(() => {
        vscode.postMessage({ type: 'statusMsgChange', statusMsg: this.value.trim() });
      }, 500);
    });

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
