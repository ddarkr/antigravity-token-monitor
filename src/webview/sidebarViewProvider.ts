import * as vscode from 'vscode';
import { DashboardState, ExtensionToSidebarMessage, SidebarToExtensionMessage } from '../types';
import { getSidebarHtml } from './getSidebarHtml';

export class SidebarViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  public static readonly viewType = 'antigravity-token-monitor.sidebarView';

  private view?: vscode.WebviewView;
  private readonly disposables: vscode.Disposable[] = [];
  private latestState?: DashboardState;
  private lastPostedStateJson?: string;
  private ready = false;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly onRefresh: () => void,
    private readonly onOpenDashboard: (sessionId?: string) => void
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;
    this.ready = false;
    this.lastPostedStateJson = undefined;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist')]
    };

    webviewView.webview.html = getSidebarHtml(webviewView.webview, this.extensionUri);

    webviewView.webview.onDidReceiveMessage((message: SidebarToExtensionMessage) => {
      if (message.type === 'sidebar/ready') {
        this.ready = true;
        this.lastPostedStateJson = undefined;
        this.postState();
        return;
      }

      if (message.type === 'sidebar/refresh') {
        this.onRefresh();
        return;
      }

      if (message.type === 'sidebar/openDashboard') {
        this.onOpenDashboard();
        return;
      }

      if (message.type === 'sidebar/openSession') {
        this.onOpenDashboard(message.sessionId);
        return;
      }
    }, null, this.disposables);

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.postState();
      }
    }, null, this.disposables);

    webviewView.onDidDispose(() => {
      this.view = undefined;
      this.ready = false;
      this.lastPostedStateJson = undefined;
    }, null, this.disposables);
  }

  update(state: DashboardState): void {
    this.latestState = state;
    this.postState();
  }

  dispose(): void {
    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }
  }

  private postState(): void {
    if (!this.view || !this.ready || !this.latestState) {
      return;
    }

    if (!this.view.visible) {
      return;
    }

    const nextStateJson = JSON.stringify(this.latestState);
    if (nextStateJson === this.lastPostedStateJson) {
      return;
    }

    this.lastPostedStateJson = nextStateJson;
    this.postMessage({ type: 'sidebar/state', payload: this.latestState });
  }

  private postMessage(message: ExtensionToSidebarMessage): void {
    void this.view?.webview.postMessage(message);
  }
}
