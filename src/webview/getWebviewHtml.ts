import * as vscode from 'vscode';

export function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'main.js'));
  const nonce = createNonce();

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src ${webview.cspSource} data:; style-src 'unsafe-inline' ${webview.cspSource}; script-src 'nonce-${nonce}';"
    />
    <title>Antigravity Token Monitor</title>
    <style>
      :root {
        color-scheme: dark light;
        /* Fallbacks for standalone testing, overridden by VS Code themes when available */
        --bg: var(--vscode-editor-background, #0f1416);
        --bg-elevated: var(--vscode-editorWidget-background, rgba(27, 36, 39, 0.86));
        --panel: var(--vscode-panel-background, rgba(17, 23, 26, 0.84));
        --panel-deep: color-mix(in srgb, var(--bg-elevated) 84%, #000 16%);
        --line: var(--vscode-widget-border, rgba(151, 190, 177, 0.16));
        --line-strong: var(--vscode-focusBorder, rgba(171, 220, 204, 0.24));
        --text: var(--vscode-editor-foreground, #e7efe7);
        --muted: var(--vscode-descriptionForeground, #9aaca4);
        --accent: var(--vscode-textLink-foreground, #88d8b0);
        --accent-strong: var(--vscode-textLink-activeForeground, #c7f296);
        --warm: var(--vscode-editorWarning-foreground, #f7c873);
        --danger: var(--vscode-editorError-foreground, #ef7d78);
        --focus: var(--vscode-focusBorder, #2a9df4);
        --surface-line: rgba(255, 255, 255, 0.055);
        --shadow: 0 18px 48px rgba(0, 0, 0, 0.28);
        --shadow-elevated: 0 12px 30px rgba(0, 0, 0, 0.35);
        --code-font: "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        --font-display: var(--vscode-font-family, "Segoe UI", "Inter", "SF Pro Text", Arial, sans-serif);
        --font-body: var(--vscode-font-family, "Segoe UI", "Inter", "SF Pro Text", Arial, sans-serif);
        --radius: 18px;
        
        --spacing-xs: 4px;
        --spacing-sm: 8px;
        --spacing-md: 16px;
        --spacing-lg: 24px;
        --spacing-xl: 32px;
        --spacing-2xl: 48px;
        
        --hero-bg: linear-gradient(180deg, var(--bg-elevated) 0%, var(--panel) 100%);
        --canvas-bg: transparent;
        --rail-bg: var(--panel);
        --deck-bg: var(--panel);
      }

      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; background: var(--bg); color: var(--text); }
      body {
        font: 13px/1.45 var(--vscode-font-family, "Segoe UI", "Inter", "SF Pro Text", Arial, sans-serif);
        min-height: 100vh;
        background:
          radial-gradient(circle at 0% 0%, rgba(255, 255, 255, 0.03), transparent 42%),
          radial-gradient(circle at 100% 0%, rgba(255, 255, 255, 0.02), transparent 38%),
          linear-gradient(140deg, var(--bg) 0%, var(--panel-deep) 100%);
      }
      button, input { font: inherit; }
      code, pre, .mono { font-family: var(--code-font); }

      .dashboard-app-shell {
        min-height: 100vh;
        position: relative;
        isolation: isolate;
      }

      .dashboard-app-shell::before {
        content: "";
        position: fixed;
        inset: 0;
        background-image:
          linear-gradient(rgba(255, 255, 255, 0.018) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255, 255, 255, 0.018) 1px, transparent 1px);
        background-size: 48px 48px;
        background-position: 0 0, 0 0;
        pointer-events: none;
        opacity: 0.35;
        z-index: -1;
      }

      /* Accessibility: Visible focus */
      *:focus-visible {
        outline: 2px solid var(--focus);
        outline-offset: 2px;
      }

      /* High contrast mode support */
      @media (forced-colors: active) {
        :root {
          --line: CanvasText;
          --line-strong: CanvasText;
          --bg-elevated: Canvas;
          --panel: Canvas;
        }
        .card, .header, .status-pill, .button, .stat-band, .analytical-table-container, .status-card, .config-card, .info-card {
          border: 1px solid CanvasText !important;
        }
      }
    </style>
  </head>
  <body>
    <div id="app" class="dashboard-app-shell"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
}

function createNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let value = '';
  for (let index = 0; index < 32; index += 1) {
    value += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return value;
}
