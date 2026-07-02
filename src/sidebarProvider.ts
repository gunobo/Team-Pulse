import * as vscode from 'vscode';
import * as ws_module from 'ws';
import { getSidebarHtml } from './webview/sidebarHtml';

const WS = ws_module.default ?? ws_module.WebSocket ?? (ws_module as any);

export interface TeamMember {
  id: string;
  name: string;
  file: string | null;
  status: 'online' | 'away' | 'offline';
  branch: string | null;
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
        case 'refresh':
          this.postMembers();
          break;
        case 'notify':
          this.sendToServer(message);
          break;
      }
    });
  }

  async connect() {
    const config    = vscode.workspace.getConfiguration('teamPulse');
    const serverUrl = config.get<string>('serverUrl') ?? 'wss://ws.imjemin.co.kr';
    const username  = config.get<string>('username') || 'IMJEMIN';

    // 저장된 초대 코드 가져오기, 없으면 입력 요청
    let code = this.context.globalState.get<string>('inviteCode');
    if (!code) {
      code = await vscode.window.showInputBox({
        title: 'Team Pulse · 초대 코드 입력',
        prompt: '팀원에게 받은 초대 코드를 입력하세요',
        placeHolder: 'XXXXXXXX',
        ignoreFocusOut: true,
      });
      if (!code) return; // 취소
      await this.context.globalState.update('inviteCode', code);
    }

    try {
      this.ws = new WS(serverUrl);

      this.ws.on('open', () => {
        this.sendToServer({ type: 'join', name: username, code });
        this.postToWebview({ type: 'connecting' });
      });

      this.ws.on('message', (raw: ws_module.RawData) => {
        let msg: any;
        try { msg = JSON.parse(raw.toString()); } catch { return; }
        this.handleMessage(msg);
      });

      this.ws.on('close', () => {
        this.postToWebview({ type: 'disconnected' });
        // 5초 후 자동 재연결
        this.reconnectTimer = setTimeout(() => this.connect(), 5000);
      });

      this.ws.on('error', (err: Error) => {
        vscode.window.showErrorMessage(`Team Pulse: ${err.message}`);
        this.postToWebview({ type: 'disconnected' });
      });

    } catch (err) {
      vscode.window.showErrorMessage(`Team Pulse: Connection failed — ${err}`);
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
    if (this.view) {
      this.view.webview.html = getSidebarHtml(this.view.webview, this.context.extensionUri);
    }
  }

  broadcastFileOpen(filePath: string) {
    this.sendToServer({ type: 'fileOpen', file: filePath });
  }

  broadcastAway(away: boolean) {
    this.sendToServer({ type: 'statusChange', status: away ? 'away' : 'online' });
  }

  // ── 서버 메시지 처리 ──────────────────────────
  private handleMessage(msg: any) {
    switch (msg.type) {

      case 'welcome':
        this.myId = msg.id;
        break;

      case 'members':
        this.members.clear();
        for (const m of msg.members) {
          if (m.id !== this.myId) this.members.set(m.id, m);
        }
        this.postToWebview({ type: 'connected' });
        this.postMembers();
        break;

      case 'memberJoined':
        if (msg.member.id !== this.myId) {
          this.members.set(msg.member.id, msg.member);
          this.postMembers();
          vscode.window.showInformationMessage(`Team Pulse: ${msg.member.name} 접속`);
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
        // 인증 오류면 저장된 코드 초기화 → 다음 접속 때 다시 입력
        if (msg.message.includes('초대 코드') || msg.message.includes('인증')) {
          this.context.globalState.update('inviteCode', undefined);
        }
        break;
    }
  }

  private postMembers() {
    this.postToWebview({
      type: 'membersUpdate',
      members: [...this.members.values()],
    });
  }

  private sendToServer(data: object) {
    if (this.ws?.readyState === WS.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private postToWebview(message: object) {
    this.view?.webview.postMessage(message);
  }
}
