import * as vscode from 'vscode';
import { DashboardState, ExtensionToWebviewMessage, WebviewToExtensionMessage } from '../types';
import { getWebviewHtml } from './getWebviewHtml';

export class DashboardPanel implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private readonly disposables: vscode.Disposable[] = [];
  private latestState?: DashboardState;
  private lastPostedStateJson?: string;
  private ready = false;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly onRefresh: () => void
  ) {}

  show(state: DashboardState): void {
    this.latestState = state;

    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        'antigravityTokenMonitor.dashboard',
        'Antigravity Token Monitor',
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist')]
        }
      );

      this.panel.webview.html = getWebviewHtml(this.panel.webview, this.extensionUri);
      this.panel.onDidDispose(() => {
        this.dispose(); // Clean up disposables on panel close
        this.panel = undefined;
        this.ready = false;
        this.lastPostedStateJson = undefined;
      }, null, this.disposables);

      this.panel.onDidChangeViewState(() => {
        if (this.panel?.visible) {
          this.postState();
        }
      }, null, this.disposables);

      this.panel.webview.onDidReceiveMessage((message: WebviewToExtensionMessage) => {
        if (message.type === 'dashboard/ready') {
          this.ready = true;
          this.lastPostedStateJson = undefined;
          this.postState();
          return;
        }

        if (message.type === 'dashboard/refresh') {
          this.onRefresh();
          return;
        }
      }, null, this.disposables);
    }

    this.panel.reveal(vscode.ViewColumn.One);
    this.postState();
  }

  update(state: DashboardState): void {
    this.latestState = state;
    this.postState();
  }

  dispose(): void {
    this.panel?.dispose();
    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }
  }

  private postState(): void {
    if (!this.panel || !this.ready || !this.latestState) {
      return;
    }

    if (!this.panel.visible) {
      return;
    }

    const nextStateJson = JSON.stringify(this.latestState);
    if (nextStateJson === this.lastPostedStateJson) {
      return;
    }

    this.lastPostedStateJson = nextStateJson;
    this.postMessage({ type: 'dashboard/state', payload: this.latestState });
  }

  private postMessage(message: ExtensionToWebviewMessage): void {
    void this.panel?.webview.postMessage(message);
  }
}
