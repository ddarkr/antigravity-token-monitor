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
    () => { void service.refreshNow(); }
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
    void service.refreshNow();
    panel.show(service.getDashboardState());
  }));

  context.subscriptions.push(vscode.commands.registerCommand(`${EXTENSION_ID}.exportNow`, async () => {
    const exportedCount = await service.exportNow({ force: true, refreshAfter: true });
    panel.show(service.getDashboardState());
    void vscode.window.showInformationMessage(`Antigravity Token Monitor exported ${exportedCount} session${exportedCount === 1 ? '' : 's'}.`);
  }));

  context.subscriptions.push(vscode.commands.registerCommand(`${EXTENSION_ID}.resetCache`, async () => {
    const confirm = await vscode.window.showWarningMessage(
      'Antigravity Token Monitor: This deletes all cached data and reprocesses everything from scratch. Do you want to continue?',
      { modal: true },
      'Reset Cache'
    );
    if (confirm !== 'Reset Cache') {
      return;
    }

    try {
      const clearedCount = await service.resetCache();
      panel.show(service.getDashboardState());
      void vscode.window.showInformationMessage(
        `Reset cache complete: cleared ${clearedCount} session cache${clearedCount === 1 ? '' : 's'} and started reprocessing.`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      void vscode.window.showErrorMessage(`Reset cache failed: ${message}`);
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
