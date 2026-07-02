"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSidebarHtml = getSidebarHtml;
function getSidebarHtml(webview, extensionUri) {
    const nonce = getNonce();
    return /* html */ `<!DOCTYPE html>
<html lang="en">
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
      padding: 12px 8px;
    }

    .header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 16px;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border, #ffffff15);
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
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    .section-label {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 8px;
      margin-top: 4px;
    }

    .member-card {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 6px;
      border-radius: 6px;
      margin-bottom: 4px;
      cursor: default;
      transition: background 0.15s;
    }
    .member-card:hover { background: var(--vscode-list-hoverBackground); }

    .avatar {
      width: 28px; height: 28px;
      border-radius: 50%;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      display: flex; align-items: center; justify-content: center;
      font-size: 12px; font-weight: 700; color: #fff;
      flex-shrink: 0;
      position: relative;
    }
    .avatar-badge {
      position: absolute;
      bottom: -1px; right: -1px;
      width: 9px; height: 9px;
      border-radius: 50%;
      border: 1.5px solid var(--vscode-sideBar-background, #1e1e1e);
    }
    .badge-online  { background: #22c55e; }
    .badge-away    { background: #f59e0b; }
    .badge-offline { background: #6b7280; }

    .member-info { flex: 1; min-width: 0; }
    .member-name {
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .member-file {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-top: 1px;
    }

    .empty-state {
      text-align: center;
      padding: 32px 16px;
      color: var(--vscode-descriptionForeground);
    }
    .empty-state .icon { font-size: 28px; margin-bottom: 10px; }
    .empty-state p { font-size: 11px; line-height: 1.6; }

    .connect-btn {
      display: block;
      width: 100%;
      margin-top: 16px;
      padding: 7px;
      border: none;
      border-radius: 5px;
      background: #6366f1;
      color: #fff;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
    }
    .connect-btn:hover { background: #4f46e5; }
  </style>
</head>
<body>
  <div class="header">
    <div class="status-dot" id="statusDot"></div>
    <span class="header-title">Team Pulse</span>
  </div>

  <div id="content">
    <div class="empty-state">
      <div class="icon">⚡</div>
      <p>서버에 연결하면<br>팀원들의 활동이<br>여기에 표시됩니다.</p>
      <button class="connect-btn" onclick="connect()">Connect</button>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    function connect() {
      vscode.postMessage({ type: 'refresh' });
    }

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'connected') {
        document.getElementById('statusDot').classList.add('connected');
        renderEmpty();
      } else if (msg.type === 'disconnected') {
        document.getElementById('statusDot').classList.remove('connected');
        renderEmpty();
      } else if (msg.type === 'membersUpdate') {
        renderMembers(msg.members);
      }
    });

    function renderMembers(members) {
      const content = document.getElementById('content');
      const online  = members.filter(m => m.status !== 'offline');
      const offline = members.filter(m => m.status === 'offline');

      content.innerHTML = \`
        <div class="section-label">Online — \${online.length}</div>
        \${online.map(memberCard).join('')}
        \${offline.length ? \`
          <div class="section-label" style="margin-top:12px">Offline — \${offline.length}</div>
          \${offline.map(memberCard).join('')}
        \` : ''}
      \`;
    }

    function memberCard(m) {
      const initial = m.name[0].toUpperCase();
      const fileLabel = m.currentFile ? m.currentFile.split('/').pop() : '—';
      return \`
        <div class="member-card">
          <div class="avatar">
            \${initial}
            <div class="avatar-badge badge-\${m.status}"></div>
          </div>
          <div class="member-info">
            <div class="member-name">\${m.name}</div>
            <div class="member-file">\${fileLabel}</div>
          </div>
        </div>
      \`;
    }

    function renderEmpty() {
      document.getElementById('content').innerHTML = \`
        <div class="empty-state">
          <div class="icon">⚡</div>
          <p>서버에 연결하면<br>팀원들의 활동이<br>여기에 표시됩니다.</p>
          <button class="connect-btn" onclick="connect()">Connect</button>
        </div>
      \`;
    }
  </script>
</body>
</html>`;
}
function getNonce() {
    let text = '';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return text;
}
//# sourceMappingURL=sidebarHtml.js.map