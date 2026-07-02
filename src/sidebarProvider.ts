import * as vscode from 'vscode';
import * as ws_module from 'ws';
import { getSidebarHtml } from './webview/sidebarHtml';

const WS = ws_module.default ?? ws_module.WebSocket ?? (ws_module as any);

export interface TeamMember {
  id: string;
  name: string;
  file: string | null;
  status: 'online' | 'away' | 'offline';
}

export class TeamPulseSidebarProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private ws?: InstanceType<typeof WS>;
  private members: Map<string, TeamMember> = new Map();
  private myId?: string;
  private reconnectTimer?: NodeJS.Timeout;

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    };
    webviewView.webview.html = getSidebarHtml(webviewView.webview, this.context.extensionUri);
    webviewView.webview.onDidReceiveMessage((message) => {
      switch (message.type) {
        case 'refresh': this.postMembers(); break;
        case 'notify':  this.sendToServer(message); break;
      }
    });
  }

  private async fetchUserRepos(authToken: string): Promise<string[]> {
    const serverBase = 'https://ws.imjemin.co.kr';
    const res  = await fetch(`${serverBase}/auth/repos?token=${authToken}`);
    const data = await res.json() as any;
    return data.repos ?? [];
  }

  private async getAuthToken(roomCode?: string): Promise<{ token: string; login: string } | undefined> {
    const saved = this.context.globalState.get<string>('authToken');
    const login = this.context.globalState.get<string>('githubLogin');
    if (saved && login) return { token: saved, login };

    const serverBase = 'https://ws.imjemin.co.kr';
    const state      = require('crypto').randomBytes(8).toString('hex');
    const roomParam  = roomCode ? `&roomCode=${roomCode}` : '';
    const oauthUrl   = `https://github.com/login/oauth/authorize?client_id=Ov23li54euhr9T1jQyBX&scope=repo&state=${state}${roomParam}`;

    // 브라우저 열기
    await vscode.env.openExternal(vscode.Uri.parse(oauthUrl));
    vscode.window.showInformationMessage('GitHub 로그인 후 VS Code로 돌아오세요.');

    // 최대 2분간 폴링
    for (let i = 0; i < 24; i++) {
      await new Promise(r => setTimeout(r, 5000));
      try {
        const res  = await fetch(`${serverBase}/auth/status?state=${state}`);
        const data = await res.json() as any;
        if (data.ready) {
          await this.context.globalState.update('authToken', data.token);
          await this.context.globalState.update('githubLogin', data.login);
          return { token: data.token, login: data.login };
        }
      } catch {}
    }

    vscode.window.showErrorMessage('Team Pulse: 인증 시간 초과. 다시 시도해주세요.');
    return undefined;
  }

  async connect() {
    const config    = vscode.workspace.getConfiguration('teamPulse');
    const serverUrl = config.get<string>('serverUrl') ?? 'wss://ws.imjemin.co.kr';

    // GitHub 인증
    const auth = await this.getAuthToken();
    if (!auth) return;
    const username = auth.login;

    // 저장된 방 코드 확인
    const savedCode = this.context.globalState.get<string>('roomCode');

    // 방 만들기 vs 참가 선택
    const action = savedCode
      ? await vscode.window.showQuickPick(
          [
            { label: '$(plug) 기존 방 참가', description: `코드: ${savedCode}`, value: 'join-saved' },
            { label: '$(add) 다른 코드로 참가', value: 'join-new' },
            { label: '$(plus) 새 방 만들기', value: 'create' },
          ],
          { title: 'Team Pulse', placeHolder: '어떻게 하시겠어요?' }
        )
      : await vscode.window.showQuickPick(
          [
            { label: '$(plus) 새 방 만들기', value: 'create' },
            { label: '$(key) 초대 코드로 참가', value: 'join-new' },
          ],
          { title: 'Team Pulse', placeHolder: '어떻게 하시겠어요?' }
        );

    if (!action) return;

    let joinCode: string | undefined;
    let roomName: string | undefined;

    let repoName: string | undefined;

    if (action.value === 'create') {
      // 방장 레포 목록 가져오기
      vscode.window.showInformationMessage('Team Pulse: 레포 목록 불러오는 중...');
      const repos = await this.fetchUserRepos(auth.token);

      if (repos.length === 0) {
        vscode.window.showErrorMessage('Team Pulse: 레포를 불러올 수 없어요.');
        return;
      }

      const picked = await vscode.window.showQuickPick(
        [
          { label: '$(circle-slash) 제한 없음', description: '누구든 코드만 있으면 입장', value: '' },
          ...repos.map(r => ({ label: `$(repo) ${r}`, description: `${r} collaborator만 입장`, value: r })),
        ],
        { title: '방과 연결할 GitHub 레포 선택', placeHolder: '레포를 선택하면 해당 collaborator만 입장 가능', ignoreFocusOut: true }
      );
      if (picked === undefined) return;
      repoName = picked.value;

      roomName = await vscode.window.showInputBox({
        title: '방 이름',
        prompt: '팀원들에게 보여질 방 이름을 입력하세요',
        placeHolder: repoName ? repoName.split('/')[1] : '우리 팀',
        ignoreFocusOut: true,
      });
      if (roomName === undefined) return;
    } else if (action.value === 'join-new') {
      const input = await vscode.window.showInputBox({
        title: '초대 코드 입력',
        prompt: '팀원에게 받은 6자리 코드를 입력하세요',
        placeHolder: 'A1B2C3',
        ignoreFocusOut: true,
      });
      if (!input) return;
      joinCode = input.trim().toUpperCase();
      await this.context.globalState.update('roomCode', joinCode);
    } else {
      joinCode = savedCode;
    }

    this.setupWebSocket(serverUrl, username, auth.token, action.value === 'create', joinCode, roomName, repoName);
  }

  private setupWebSocket(
    serverUrl: string,
    username: string,
    token: string,
    isCreate: boolean,
    joinCode?: string,
    roomName?: string,
    repoName?: string
  ) {
    clearTimeout(this.reconnectTimer);
    this.ws = new WS(serverUrl);

    this.ws.on('open', () => {
      this.postToWebview({ type: 'connecting' });
      if (isCreate) {
        this.sendToServer({ type: 'createRoom', token, roomName: roomName || `${username}의 방`, repo: repoName || null });
      } else {
        this.sendToServer({ type: 'joinRoom', token, code: joinCode });
      }
    });

    this.ws.on('message', (raw: ws_module.RawData) => {
      let msg: any;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      this.handleMessage(msg);
    });

    this.ws.on('close', () => {
      this.postToWebview({ type: 'disconnected' });
      this.reconnectTimer = setTimeout(() => {
        const config    = vscode.workspace.getConfiguration('teamPulse');
        const serverUrl = config.get<string>('serverUrl') ?? 'wss://ws.imjemin.co.kr';
        const savedCode = this.context.globalState.get<string>('roomCode');
        const savedToken= this.context.globalState.get<string>('authToken');
        const savedLogin= this.context.globalState.get<string>('githubLogin');
        if (savedCode && savedToken && savedLogin) {
          this.setupWebSocket(serverUrl, savedLogin, savedToken, false, savedCode);
        }
      }, 5000);
    });

    this.ws.on('error', (err: Error) => {
      vscode.window.showErrorMessage(`Team Pulse: ${err.message}`);
    });
  }

  private handleMessage(msg: any) {
    switch (msg.type) {

      case 'roomCreated': {
        // 방 만들기 성공 → 코드 저장 후 팀원에게 공유 안내
        this.context.globalState.update('roomCode', msg.code);
        vscode.window.showInformationMessage(
          `방 생성 완료! 초대 코드: ${msg.code}`,
          '클립보드에 복사'
        ).then(action => {
          if (action === '클립보드에 복사') {
            vscode.env.clipboard.writeText(msg.code);
            vscode.window.showInformationMessage(`"${msg.code}" 복사됐어요!`);
          }
        });
        this.postToWebview({ type: 'connected', roomName: msg.roomName, code: msg.code });
        break;
      }

      case 'welcome':
        this.postToWebview({ type: 'connected', roomName: msg.roomName });
        break;

      case 'members':
        this.members.clear();
        for (const m of msg.members) {
          if (m.id !== this.myId) this.members.set(m.id, m);
        }
        this.postMembers();
        break;

      case 'memberJoined':
        if (msg.member.id !== this.myId) {
          this.members.set(msg.member.id, msg.member);
          this.postMembers();
          vscode.window.showInformationMessage(`Team Pulse: ${msg.member.name} 입장`);
        }
        break;

      case 'memberUpdated':
        if (msg.member.id !== this.myId) {
          this.members.set(msg.member.id, msg.member);
          this.postMembers();
        }
        break;

      case 'memberLeft':
        this.members.delete(msg.id);
        this.postMembers();
        break;

      case 'notification':
        vscode.window.showInformationMessage(`💬 ${msg.from}: ${msg.message}`);
        break;

      case 'error':
        vscode.window.showErrorMessage(`Team Pulse: ${msg.message}`);
        if (msg.message.includes('초대 코드') || msg.message.includes('코드')) {
          this.context.globalState.update('roomCode', undefined);
        }
        break;
    }
  }

  disconnect() {
    clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws      = undefined;
    this.myId    = undefined;
    this.members.clear();
    this.postToWebview({ type: 'disconnected' });
  }

  refresh() {
    this.postMembers();
  }

  broadcastFileOpen(filePath: string) {
    this.sendToServer({ type: 'fileOpen', file: filePath });
  }

  broadcastAway(away: boolean) {
    this.sendToServer({ type: 'statusChange', status: away ? 'away' : 'online' });
  }

  private postMembers() {
    this.postToWebview({ type: 'membersUpdate', members: [...this.members.values()] });
  }

  private sendToServer(data: object) {
    if (this.ws?.readyState === WS.OPEN) this.ws.send(JSON.stringify(data));
  }

  private postToWebview(message: object) {
    this.view?.webview.postMessage(message);
  }
}
