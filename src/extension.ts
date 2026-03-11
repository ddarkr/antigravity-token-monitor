import * as vscode from 'vscode';
import { EXTENSION_ID, readConfig } from './config';
import { SessionScanner } from './monitor/sessionScanner';
import { SessionUsageCalculator } from './monitor/sessionUsageCalculator';
import { TokenMonitorService } from './monitor/tokenMonitorService';
import { AntigravitySessionParser } from './parser/antigravitySessionParser';
import { SnapshotStore } from './storage/snapshotStore';
import { TokenStatusBar } from './statusBar/tokenStatusBar';
import { DashboardPanel } from './webview/dashboardPanel';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel('Antigravity Token Monitor');
  const scanner = new SessionScanner();
  const calculator = new SessionUsageCalculator();
  const store = new SnapshotStore(context);
  const service = new TokenMonitorService(
    () => readConfig(),
    scanner,
    (config) => new AntigravitySessionParser(config.maxFileBytes),
    calculator,
    store,
    outputChannel
  );

  const panel = new DashboardPanel(
    context.extensionUri,
    () => { void service.exportNow({ force: false, refreshAfter: true }); }
  );
  const statusBar = new TokenStatusBar();

  context.subscriptions.push(service, panel, statusBar, outputChannel);
  context.subscriptions.push(service.onDidChange((state) => {
    panel.update(state);
  }));

  context.subscriptions.push(vscode.commands.registerCommand(`${EXTENSION_ID}.openDashboard`, async () => {
    panel.show(service.getDashboardState());
    await service.exportNow({ force: false, refreshAfter: true });
    panel.show(service.getDashboardState());
  }));

  context.subscriptions.push(vscode.commands.registerCommand(`${EXTENSION_ID}.refreshNow`, async () => {
    void service.exportNow({ force: false, refreshAfter: true });
    panel.show(service.getDashboardState());
  }));

  context.subscriptions.push(vscode.commands.registerCommand(`${EXTENSION_ID}.exportNow`, async () => {
    const exportedCount = await service.exportNow({ force: true, refreshAfter: true });
    panel.show(service.getDashboardState());
    void vscode.window.showInformationMessage(`Antigravity Token Monitor exported ${exportedCount} session${exportedCount === 1 ? '' : 's'}.`);
  }));

  context.subscriptions.push(vscode.commands.registerCommand(`${EXTENSION_ID}.resetCache`, async () => {
    const confirm = await vscode.window.showWarningMessage(
      'Antigravity Token Monitor: 모든 캐시 데이터를 삭제하고 처음부터 다시 처리합니다. 계속하시겠습니까?',
      { modal: true },
      '초기화'
    );
    if (confirm !== '초기화') {
      return;
    }

    try {
      const clearedCount = await service.resetCache();
      panel.show(service.getDashboardState());
      void vscode.window.showInformationMessage(
        `캐시 초기화 완료: ${clearedCount}개 세션 캐시 삭제 후 재처리를 시작했습니다.`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      void vscode.window.showErrorMessage(`캐시 초기화 실패: ${message}`);
    }
  }));

  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration(EXTENSION_ID)) {
      service.restart();
    }
  }));

  try {
    await service.initialize();
    context.subscriptions.push(service.onDidChange((state) => {
      statusBar.update(state);
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to initialize token monitor.';
    outputChannel.appendLine(`[${new Date().toISOString()}] Activation initialize failed: ${message}`);
    statusBar.showError(`Antigravity Token Monitor failed to initialize: ${message}`);
    void vscode.window.showErrorMessage(`Antigravity Token Monitor failed to initialize: ${message}`);
  }
}

export function deactivate(): void {
}
