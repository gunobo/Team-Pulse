import * as vscode from 'vscode';
import { TeamPulseSidebarProvider } from './sidebarProvider';
import { StatusBarManager } from './statusBar';

export function activate(context: vscode.ExtensionContext) {
  const sidebarProvider = new TeamPulseSidebarProvider(context);
  const statusBar = new StatusBarManager();

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('teamPulse.sidebar', sidebarProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),

    vscode.commands.registerCommand('teamPulse.refresh', () => {
      sidebarProvider.refresh();
    }),

    vscode.commands.registerCommand('teamPulse.connect', () => {
      sidebarProvider.connect();
      statusBar.setConnected(true);
    }),

    vscode.commands.registerCommand('teamPulse.disconnect', () => {
      sidebarProvider.disconnect();
      statusBar.setConnected(false);
    }),

    vscode.commands.registerCommand('teamPulse.resetCode', async () => {
      await sidebarProvider.clearRoomCode();
      vscode.window.showInformationMessage('Team Pulse: 방 코드가 초기화됐어요. 다시 Connect 하세요.');
    }),

    vscode.commands.registerCommand('teamPulse.logout', async () => {
      await context.globalState.update('authToken', undefined);
      await context.globalState.update('githubLogin', undefined);
      await sidebarProvider.clearRoomCode();
      sidebarProvider.disconnect();
      vscode.window.showInformationMessage('Team Pulse: 로그아웃됐어요.');
    }),

    vscode.commands.registerCommand('teamPulse.relogin', async () => {
      await context.globalState.update('authToken', undefined);
      await context.globalState.update('githubLogin', undefined);
      await sidebarProvider.clearRoomCode();
      sidebarProvider.disconnect();
      vscode.window.showInformationMessage('Team Pulse: 다시 로그인할게요...');
      sidebarProvider.connect();
    }),

    statusBar
  );

  // 현재 파일 변경 이벤트 → 팀원들에게 broadcast
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        const fullPath = editor.document.uri.fsPath;
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const relativePath = workspaceRoot && fullPath.startsWith(workspaceRoot)
          ? fullPath.slice(workspaceRoot.length).replace(/^[\\/]/, '')
          : fullPath.split(/[\\/]/).pop() ?? fullPath;
        sidebarProvider.broadcastFileOpen(relativePath);
      }
    }),
    // 파일 저장 시 git 수정 파일 목록 broadcast
    vscode.workspace.onDidSaveTextDocument(() => {
      sidebarProvider.broadcastGitStatus();
    })
  );

  // 60초마다 git 수정 파일 목록 갱신
  const gitStatusInterval = setInterval(() => {
    sidebarProvider.broadcastGitStatus();
  }, 60000);
  context.subscriptions.push({ dispose: () => clearInterval(gitStatusInterval) });

  const config = vscode.workspace.getConfiguration('teamPulse');
  if (config.get<boolean>('autoConnect')) {
    vscode.commands.executeCommand('teamPulse.connect');
  }
}

export function deactivate() {}
