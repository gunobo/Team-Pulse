"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TeamPulseSidebarProvider = void 0;
const vscode = __importStar(require("vscode"));
const ws_module = __importStar(require("ws"));
const cp = __importStar(require("child_process"));
const sidebarHtml_1 = require("./webview/sidebarHtml");
const WS = ws_module.default ?? ws_module.WebSocket ?? ws_module;
class TeamPulseSidebarProvider {
    context;
    view;
    ws;
    members = new Map();
    myId;
    reconnectTimer;
    pingTimer;
    constructor(context) {
        this.context = context;
    }
    resolveWebviewView(webviewView) {
        this.view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.context.extensionUri],
        };
        webviewView.webview.html = (0, sidebarHtml_1.getSidebarHtml)(webviewView.webview, this.context.extensionUri);
        // 웹뷰 로드 후 로그인 상태 + git remote 전달
        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.type) {
                case 'ready': {
                    const login = this.context.globalState.get('githubLogin');
                    const remote = await this.detectGitRemote();
                    this.postToWebview({ type: 'init', login, remote });
                    // 저장된 방 코드 있으면 자동 재연결
                    const savedCode = this.getRoomCode();
                    const savedToken = this.context.globalState.get('authToken');
                    if (savedCode && savedToken && login) {
                        const serverUrl = vscode.workspace.getConfiguration('teamPulse').get('serverUrl') ?? 'wss://ws.imjemin.co.kr';
                        this.setupWebSocket(serverUrl, login, savedToken, false, savedCode);
                    }
                    break;
                }
                case 'login':
                    this.doLogin();
                    break;
                case 'logout':
                    await this.context.globalState.update('authToken', undefined);
                    await this.context.globalState.update('githubLogin', undefined);
                    await this.setRoomCode(undefined);
                    this.disconnect();
                    this.postToWebview({ type: 'init', login: undefined, remote: await this.detectGitRemote() });
                    break;
                case 'createRoom':
                    this.connectAndCreate(message.roomName, message.repo);
                    break;
                case 'joinRoom':
                    this.connectAndJoin(message.code);
                    break;
                case 'disconnect':
                    this.disconnect();
                    break;
                case 'copyCode':
                    vscode.env.clipboard.writeText(message.code);
                    vscode.window.showInformationMessage(`Team Pulse: 코드 복사됨 — ${message.code}`);
                    break;
                case 'notify':
                    this.sendToServer(message);
                    break;
            }
        });
    }
    getWorkspaceKey() {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root)
            return 'default';
        // 경로를 안전한 키로 변환
        return root.replace(/[^a-zA-Z0-9]/g, '_');
    }
    getRoomCode() {
        return this.context.globalState.get(`roomCode_${this.getWorkspaceKey()}`);
    }
    async setRoomCode(code) {
        await this.context.globalState.update(`roomCode_${this.getWorkspaceKey()}`, code);
    }
    detectGitRemote() {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot)
            return Promise.resolve('');
        return new Promise(resolve => {
            cp.exec('git remote get-url origin', { cwd: workspaceRoot }, (err, stdout) => {
                if (err) {
                    resolve('');
                    return;
                }
                const url = stdout.trim();
                // https://github.com/owner/repo.git → owner/repo
                const match = url.match(/github\.com[:/](.+?)(?:\.git)?$/);
                resolve(match ? match[1] : '');
            });
        });
    }
    async doLogin() {
        const serverBase = 'https://ws.imjemin.co.kr';
        const state = require('crypto').randomBytes(8).toString('hex');
        const oauthUrl = `https://github.com/login/oauth/authorize?client_id=Ov23li54euhr9T1jQyBX&scope=repo,read:org&state=${state}`;
        await vscode.env.openExternal(vscode.Uri.parse(oauthUrl));
        this.postToWebview({ type: 'loggingIn' });
        for (let i = 0; i < 24; i++) {
            await new Promise(r => setTimeout(r, 5000));
            try {
                const res = await fetch(`${serverBase}/auth/status?state=${state}`);
                const data = await res.json();
                if (data.ready) {
                    await this.context.globalState.update('authToken', data.token);
                    await this.context.globalState.update('githubLogin', data.login);
                    const remote = await this.detectGitRemote();
                    this.postToWebview({ type: 'init', login: data.login, remote });
                    return;
                }
            }
            catch { }
        }
        this.postToWebview({ type: 'loginFailed' });
    }
    async fetchUserRepos(authToken) {
        const serverBase = 'https://ws.imjemin.co.kr';
        const res = await fetch(`${serverBase}/auth/repos?token=${authToken}`);
        const data = await res.json();
        return data.repos ?? [];
    }
    async getAuthToken(roomCode) {
        const saved = this.context.globalState.get('authToken');
        const login = this.context.globalState.get('githubLogin');
        if (saved && login)
            return { token: saved, login };
        const serverBase = 'https://ws.imjemin.co.kr';
        const state = require('crypto').randomBytes(8).toString('hex');
        const roomParam = roomCode ? `&roomCode=${roomCode}` : '';
        const oauthUrl = `https://github.com/login/oauth/authorize?client_id=Ov23li54euhr9T1jQyBX&scope=repo,read:org&state=${state}${roomParam}`;
        // 브라우저 열기
        await vscode.env.openExternal(vscode.Uri.parse(oauthUrl));
        vscode.window.showInformationMessage('GitHub 로그인 후 VS Code로 돌아오세요.');
        // 최대 2분간 폴링
        for (let i = 0; i < 24; i++) {
            await new Promise(r => setTimeout(r, 5000));
            try {
                const res = await fetch(`${serverBase}/auth/status?state=${state}`);
                const data = await res.json();
                if (data.ready) {
                    await this.context.globalState.update('authToken', data.token);
                    await this.context.globalState.update('githubLogin', data.login);
                    return { token: data.token, login: data.login };
                }
            }
            catch { }
        }
        vscode.window.showErrorMessage('Team Pulse: 인증 시간 초과. 다시 시도해주세요.');
        return undefined;
    }
    async connect() {
        // 자동 재연결용 (저장된 코드로 바로 참가)
        const savedCode = this.getRoomCode();
        const savedToken = this.context.globalState.get('authToken');
        const savedLogin = this.context.globalState.get('githubLogin');
        if (savedCode && savedToken && savedLogin) {
            const serverUrl = vscode.workspace.getConfiguration('teamPulse').get('serverUrl') ?? 'wss://ws.imjemin.co.kr';
            this.setupWebSocket(serverUrl, savedLogin, savedToken, false, savedCode);
        }
    }
    async connectAndCreate(roomName, repo) {
        const config = vscode.workspace.getConfiguration('teamPulse');
        const serverUrl = config.get('serverUrl') ?? 'wss://ws.imjemin.co.kr';
        const auth = await this.getAuthToken();
        if (!auth)
            return;
        this.setupWebSocket(serverUrl, auth.login, auth.token, true, undefined, roomName, repo ?? undefined);
    }
    async connectAndJoin(code) {
        const config = vscode.workspace.getConfiguration('teamPulse');
        const serverUrl = config.get('serverUrl') ?? 'wss://ws.imjemin.co.kr';
        const auth = await this.getAuthToken();
        if (!auth)
            return;
        await this.setRoomCode(code);
        this.setupWebSocket(serverUrl, auth.login, auth.token, false, code);
    }
    setupWebSocket(serverUrl, username, token, isCreate, joinCode, roomName, repoName) {
        clearTimeout(this.reconnectTimer);
        clearInterval(this.pingTimer);
        this.ws = new WS(serverUrl);
        this.ws.on('open', () => {
            this.postToWebview({ type: 'connecting' });
            if (isCreate) {
                this.sendToServer({ type: 'createRoom', token, roomName: roomName || `${username}의 방`, repo: repoName || null });
            }
            else {
                this.sendToServer({ type: 'joinRoom', token, code: joinCode });
            }
            // 30초마다 ping → Cloudflare idle timeout 방지
            this.pingTimer = setInterval(() => {
                this.sendToServer({ type: 'ping' });
            }, 30000);
        });
        this.ws.on('message', (raw) => {
            let msg;
            try {
                msg = JSON.parse(raw.toString());
            }
            catch {
                return;
            }
            this.handleMessage(msg);
        });
        this.ws.on('close', () => {
            clearInterval(this.pingTimer);
            this.postToWebview({ type: 'disconnected' });
            this.reconnectTimer = setTimeout(() => {
                const config = vscode.workspace.getConfiguration('teamPulse');
                const serverUrl = config.get('serverUrl') ?? 'wss://ws.imjemin.co.kr';
                const savedCode = this.getRoomCode();
                const savedToken = this.context.globalState.get('authToken');
                const savedLogin = this.context.globalState.get('githubLogin');
                if (savedCode && savedToken && savedLogin) {
                    this.setupWebSocket(serverUrl, savedLogin, savedToken, false, savedCode);
                }
            }, 5000);
        });
        this.ws.on('error', (err) => {
            vscode.window.showErrorMessage(`Team Pulse: ${err.message}`);
        });
    }
    handleMessage(msg) {
        switch (msg.type) {
            case 'roomCreated':
                this.setRoomCode(msg.code);
                this.postToWebview({ type: 'roomCreated', roomName: msg.roomName, code: msg.code });
                break;
            case 'welcome':
                this.postToWebview({ type: 'welcome', roomName: msg.roomName, code: this.getRoomCode() });
                break;
            case 'members':
                this.members.clear();
                for (const m of msg.members) {
                    if (m.id !== this.myId)
                        this.members.set(m.id, m);
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
                if (msg.code === 'TOKEN_EXPIRED') {
                    this.context.globalState.update('authToken', undefined);
                    this.context.globalState.update('githubLogin', undefined);
                    vscode.window.showInformationMessage('Team Pulse: 다시 로그인할게요...', '로그인').then(a => {
                        if (a === '로그인')
                            this.connect();
                    });
                }
                else if (msg.code === 'ROOM_EXPIRED') {
                    this.setRoomCode(undefined);
                    vscode.window.showWarningMessage('Team Pulse: 방이 만료됐어요. 새로 연결해주세요.', '다시 설정').then(a => {
                        if (a === '다시 설정')
                            this.connect();
                    });
                }
                else if (msg.message.includes('초대 코드') || msg.message.includes('코드')) {
                    this.setRoomCode(undefined);
                }
                break;
        }
    }
    async clearRoomCode() {
        await this.setRoomCode(undefined);
    }
    disconnect() {
        clearTimeout(this.reconnectTimer);
        clearInterval(this.pingTimer);
        this.ws?.close();
        this.ws = undefined;
        this.myId = undefined;
        this.members.clear();
        this.postToWebview({ type: 'disconnected' });
    }
    refresh() {
        this.postMembers();
    }
    broadcastFileOpen(filePath) {
        this.sendToServer({ type: 'fileOpen', file: filePath });
    }
    broadcastGitStatus() {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot)
            return;
        cp.exec('git diff --name-only HEAD', { cwd: workspaceRoot }, (err, stdout) => {
            if (err)
                return;
            const files = stdout.trim().split('\n').filter(Boolean);
            this.sendToServer({ type: 'gitStatus', files });
        });
    }
    broadcastAway(away) {
        this.sendToServer({ type: 'statusChange', status: away ? 'away' : 'online' });
    }
    postMembers() {
        this.postToWebview({ type: 'membersUpdate', members: [...this.members.values()] });
    }
    sendToServer(data) {
        if (this.ws?.readyState === WS.OPEN)
            this.ws.send(JSON.stringify(data));
    }
    postToWebview(message) {
        this.view?.webview.postMessage(message);
    }
}
exports.TeamPulseSidebarProvider = TeamPulseSidebarProvider;
//# sourceMappingURL=sidebarProvider.js.map