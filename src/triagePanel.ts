/**
 * Triage Panel — renders the triage report in a VS Code WebviewPanel.
 */

import * as vscode from 'vscode';

export class TriagePanel {
  private static _current: TriagePanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel) {
    this._panel = panel;
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  static createOrShow(extensionUri: vscode.Uri): TriagePanel {
    const column = vscode.window.activeTextEditor
      ? vscode.ViewColumn.Beside
      : vscode.ViewColumn.One;

    if (TriagePanel._current) {
      TriagePanel._current._panel.reveal(column);
      return TriagePanel._current;
    }

    const panel = vscode.window.createWebviewPanel(
      'triageAgent',
      'Triage Agent Report',
      column,
      {
        enableScripts: false,
        localResourceRoots: [extensionUri],
      }
    );

    TriagePanel._current = new TriagePanel(panel);
    return TriagePanel._current;
  }

  /**
   * Update the webview with a new Markdown report.
   *
   * @param markdownReport  The Markdown-formatted triage report.
   * @param title           Optional panel title suffix.
   */
  update(markdownReport: string, title?: string): void {
    this._panel.title = title ? `Triage Report — ${title}` : 'Triage Agent Report';
    this._panel.webview.html = this._renderHtml(markdownReport);
  }

  /** Show a loading spinner while the agent is running. */
  showLoading(message = 'Running triage analysis…'): void {
    this._panel.webview.html = this._loadingHtml(message);
  }

  dispose(): void {
    TriagePanel._current = undefined;
    this._panel.dispose();
    for (const d of this._disposables) {
      d.dispose();
    }
    this._disposables = [];
  }

  // -------------------------------------------------------------------------

  private _renderHtml(markdown: string): string {
    const escaped = escapeHtml(markdown);
    // Convert basic Markdown to HTML for display (headings, bold, lists, code)
    const html = markdownToHtml(escaped);
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
  <title>Triage Agent Report</title>
  <style>
    body {
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      color: var(--vscode-editor-foreground, #cccccc);
      background: var(--vscode-editor-background, #1e1e1e);
      padding: 1.2em 2em;
      line-height: 1.6;
      max-width: 900px;
      margin: 0 auto;
    }
    h1, h2, h3 { color: var(--vscode-textLink-foreground, #4fc1ff); }
    h2 { border-bottom: 1px solid var(--vscode-panel-border, #444); padding-bottom: 4px; }
    code, pre {
      font-family: var(--vscode-editor-font-family, 'Courier New', monospace);
      background: var(--vscode-textCodeBlock-background, #2d2d2d);
      border-radius: 3px;
      padding: 2px 5px;
    }
    pre { padding: 8px 12px; overflow-x: auto; }
    ul { padding-left: 1.5em; }
    li { margin-bottom: 4px; }
    .error   { color: var(--vscode-editorError-foreground, #f48771); }
    .warning { color: var(--vscode-editorWarning-foreground, #cca700); }
    .info    { color: var(--vscode-editorInfo-foreground, #75beff); }
  </style>
</head>
<body>
${html}
</body>
</html>`;
  }

  private _loadingHtml(message: string): string {
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
  <title>Triage Agent</title>
  <style>
    body {
      display: flex; align-items: center; justify-content: center;
      height: 100vh; margin: 0;
      font-family: var(--vscode-font-family, sans-serif);
      color: var(--vscode-editor-foreground, #ccc);
      background: var(--vscode-editor-background, #1e1e1e);
    }
    .spinner {
      width: 32px; height: 32px;
      border: 3px solid var(--vscode-panel-border, #444);
      border-top-color: var(--vscode-textLink-foreground, #4fc1ff);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin-right: 12px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="spinner"></div>
  <span>${escapeHtml(message)}</span>
</body>
</html>`;
  }
}

// ---------------------------------------------------------------------------
// Minimal Markdown → HTML converter (no external deps)
// ---------------------------------------------------------------------------

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function markdownToHtml(escaped: string): string {
  // We receive already-escaped HTML; work on escaped content.
  return escaped
    // Headings
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Unordered list items
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    // Wrap consecutive <li> in <ul>
    .replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>')
    // Numbered list items
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    // Blank lines → paragraph breaks
    .replace(/\n{2,}/g, '</p><p>')
    // Wrap everything in <p> and fix adjacent tags
    .replace(/^(.+)$/, '<p>$1</p>')
    // Clean up empty paragraphs
    .replace(/<p>\s*<\/p>/g, '');
}
