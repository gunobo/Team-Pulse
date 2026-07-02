import * as vscode from 'vscode';

export class StatusBarManager implements vscode.Disposable {
  private item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = 'teamPulse.connect';
    this.setConnected(false);
    this.item.show();
  }

  setConnected(connected: boolean) {
    if (connected) {
      this.item.text = '$(pulse) Team Pulse';
      this.item.tooltip = 'Team Pulse: Connected — click to disconnect';
      this.item.command = 'teamPulse.disconnect';
      this.item.backgroundColor = undefined;
    } else {
      this.item.text = '$(circle-slash) Team Pulse';
      this.item.tooltip = 'Team Pulse: Disconnected — click to connect';
      this.item.command = 'teamPulse.connect';
      this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    }
  }

  dispose() {
    this.item.dispose();
  }
}
