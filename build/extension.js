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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const sidebarProvider_1 = require("./sidebarProvider");
const statusBar_1 = require("./statusBar");
function activate(context) {
    const sidebarProvider = new sidebarProvider_1.TeamPulseSidebarProvider(context);
    const statusBar = new statusBar_1.StatusBarManager();
    context.subscriptions.push(vscode.window.registerWebviewViewProvider('teamPulse.sidebar', sidebarProvider), vscode.commands.registerCommand('teamPulse.refresh', () => {
        sidebarProvider.refresh();
    }), vscode.commands.registerCommand('teamPulse.connect', () => {
        sidebarProvider.connect();
        statusBar.setConnected(true);
    }), vscode.commands.registerCommand('teamPulse.disconnect', () => {
        sidebarProvider.disconnect();
        statusBar.setConnected(false);
    }), vscode.commands.registerCommand('teamPulse.resetCode', async () => {
        await context.globalState.update('roomCode', undefined);
        vscode.window.showInformationMessage('Team Pulse: 방 코드가 초기화됐어요. 다시 Connect 하세요.');
    }), vscode.commands.registerCommand('teamPulse.logout', async () => {
        await context.globalState.update('authToken', undefined);
        await context.globalState.update('githubLogin', undefined);
        await context.globalState.update('roomCode', undefined);
        sidebarProvider.disconnect();
        vscode.window.showInformationMessage('Team Pulse: 로그아웃됐어요.');
    }), vscode.commands.registerCommand('teamPulse.relogin', async () => {
        await context.globalState.update('authToken', undefined);
        await context.globalState.update('githubLogin', undefined);
        await context.globalState.update('roomCode', undefined);
        sidebarProvider.disconnect();
        vscode.window.showInformationMessage('Team Pulse: 다시 로그인할게요...');
        sidebarProvider.connect();
    }), statusBar);
    // 현재 파일 변경 이벤트 → 팀원들에게 broadcast
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) {
            const fullPath = editor.document.uri.fsPath;
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            const relativePath = workspaceRoot && fullPath.startsWith(workspaceRoot)
                ? fullPath.slice(workspaceRoot.length).replace(/^[\\/]/, '')
                : fullPath.split(/[\\/]/).pop() ?? fullPath;
            sidebarProvider.broadcastFileOpen(relativePath);
        }
    }));
    const config = vscode.workspace.getConfiguration('teamPulse');
    if (config.get('autoConnect')) {
        vscode.commands.executeCommand('teamPulse.connect');
    }
}
function deactivate() { }
//# sourceMappingURL=extension.js.map