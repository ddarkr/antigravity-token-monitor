import { describe, it, expect } from 'vitest';
import * as vscode from 'vscode';
import { getWebviewHtml } from './getWebviewHtml';

describe('getWebviewHtml', () => {
  it('generates HTML with correct CSP and nonce', () => {
    const mockWebview = {
      cspSource: 'vscode-webview-resource:',
      asWebviewUri: (uri: vscode.Uri) => `vscode-webview-resource://${uri.path}`,
      onDidReceiveMessage: () => ({ dispose: () => {} }),
      postMessage: () => Promise.resolve(true),
      html: '',
      options: {}
    } as unknown as vscode.Webview;

    const mockExtensionUri = {
      path: '/mock/extension/path',
      with: () => mockExtensionUri,
      scheme: 'file',
      authority: '',
      query: '',
      fragment: '',
      fsPath: '/mock/extension/path',
      toJSON: () => ({})
    } as unknown as vscode.Uri;

    const originalJoinPath = vscode.Uri.joinPath;
    vscode.Uri.joinPath = (base: vscode.Uri, ...pathSegments: string[]) => {
      return {
        ...base,
        path: `${base.path}/${pathSegments.join('/')}`
      } as vscode.Uri;
    };

    try {
      const html = getWebviewHtml(mockWebview, mockExtensionUri);

      expect(html).toContain('http-equiv="Content-Security-Policy"');
      expect(html).toContain(`default-src 'none'`);
      expect(html).toContain(`img-src vscode-webview-resource: data:`);
      expect(html).toContain(`style-src 'unsafe-inline' vscode-webview-resource:`);
      
      const nonceMatch = html.match(/nonce="([^"]+)"/);
      expect(nonceMatch).toBeTruthy();
      const nonce = nonceMatch![1];
      expect(nonce.length).toBe(32);
      
      expect(html).toContain(`script-src 'nonce-${nonce}'`);
      expect(html).toContain(`<script nonce="${nonce}" src="vscode-webview-resource:///mock/extension/path/dist/webview/main.js"></script>`);
      
      expect(html).toContain('var(--vscode-editor-background');
      expect(html).toContain('*:focus-visible');
      expect(html).toContain('@media (forced-colors: active)');
      
      expect(html).toContain('--code-font');
      expect(html).toContain('--surface-line');
      expect(html).toContain('--shadow-elevated');
      
      expect(html).toContain('--spacing-xs');
      expect(html).toContain('--spacing-sm');
      expect(html).toContain('--spacing-md');
      expect(html).toContain('--spacing-lg');
      expect(html).toContain('--spacing-xl');
      expect(html).toContain('--spacing-2xl');
      expect(html).toContain('--font-display');
      expect(html).toContain('--font-body');
      expect(html).toContain('--hero-bg');
      expect(html).toContain('--canvas-bg');
      expect(html).toContain('--rail-bg');
      expect(html).toContain('--deck-bg');
    } finally {
      vscode.Uri.joinPath = originalJoinPath;
    }
  });
});
