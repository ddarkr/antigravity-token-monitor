import * as vscode from 'vscode';
import { EXTENSION_ID } from '../config';
import type { DashboardState } from '../types';
import { buildTokenStatusBarPresentation } from './tokenStatusBarPresentation';

export class TokenStatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = `${EXTENSION_ID}.openDashboard`;
    this.item.name = 'Antigravity Token Monitor';
    this.item.text = '$(sync~spin) AG Tokens';
    this.item.tooltip = 'Loading token usage...';
    this.item.show();
  }

  update(state: DashboardState): void {
    const presentation = buildTokenStatusBarPresentation(state);
    this.item.text = presentation.text;
    this.item.tooltip = presentation.tooltip;
    this.item.backgroundColor = presentation.isError
      ? new vscode.ThemeColor('statusBarItem.errorBackground')
      : undefined;
    this.item.show();
  }

  showError(message: string): void {
    this.item.text = '$(warning) AG Tokens';
    this.item.tooltip = message;
    this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    this.item.show();
  }

  dispose(): void {
    this.item.dispose();
  }
}
