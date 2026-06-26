/**
 * VS Copilot Triage Agent — main extension entry point.
 *
 * Registers three commands:
 *   - triageAgent.triageLogs        — parse and triage the active log file
 *   - triageAgent.parseSourceCode   — parse the active source file
 *   - triageAgent.triageAll         — parse source + triage logs together
 */

import * as vscode from 'vscode';
import { parseLogs } from './logParser';
import { parseSourceCode } from './sourceParser';
import { runTriageAgent } from './triageAgent';
import { TriagePanel } from './triagePanel';

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('triageAgent.triageLogs', () =>
      triageLogs(context.extensionUri)
    ),
    vscode.commands.registerCommand('triageAgent.parseSourceCode', () =>
      parseSingleSourceFile(context.extensionUri)
    ),
    vscode.commands.registerCommand('triageAgent.triageAll', () =>
      triageAll(context.extensionUri)
    )
  );
}

export function deactivate(): void {
  // Nothing to clean up — disposables are tracked via context.subscriptions.
}

// ---------------------------------------------------------------------------
// Command implementations
// ---------------------------------------------------------------------------

/**
 * Triage the currently active log file (or ask the user to pick one).
 */
async function triageLogs(extensionUri: vscode.Uri): Promise<void> {
  const logText = await getLogText();
  if (!logText) { return; }

  const panel = TriagePanel.createOrShow(extensionUri);
  panel.showLoading('Triaging logs…');

  const cancellation = new vscode.CancellationTokenSource();
  try {
    const config = vscode.workspace.getConfiguration('triageAgent');
    const maxLines = config.get<number>('maxLogLines', 500);
    const parsed = parseLogs(logText, maxLines);

    const result = await runTriageAgent(
      parsed,
      null,
      [],
      cancellation.token
    );

    panel.update(result.report, 'Logs');
    void vscode.window.showInformationMessage(`Triage complete: ${result.summary}`);
  } catch (err) {
    panel.update(`## Error\n\n${String(err)}`);
    void vscode.window.showErrorMessage(`Triage failed: ${String(err)}`);
  } finally {
    cancellation.dispose();
  }
}

/**
 * Parse the currently active source file and show a structural summary.
 */
async function parseSingleSourceFile(extensionUri: vscode.Uri): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showWarningMessage(
      'Triage Agent: No active editor. Open a source file and try again.'
    );
    return;
  }

  const panel = TriagePanel.createOrShow(extensionUri);
  panel.showLoading('Parsing source code…');

  const cancellation = new vscode.CancellationTokenSource();
  try {
    const text = editor.document.getText();
    const filePath = editor.document.fileName;
    const parsedSource = parseSourceCode(text, filePath);

    const config = vscode.workspace.getConfiguration('triageAgent');
    const includeDiagnostics = config.get<boolean>('includeDiagnostics', true);
    const diagnostics = includeDiagnostics
      ? vscode.languages.getDiagnostics(editor.document.uri)
      : [];

    const result = await runTriageAgent(
      null,
      parsedSource,
      diagnostics,
      cancellation.token
    );

    panel.update(result.report, filePath.split(/[\\/]/).pop());
  } catch (err) {
    panel.update(`## Error\n\n${String(err)}`);
    void vscode.window.showErrorMessage(`Parse failed: ${String(err)}`);
  } finally {
    cancellation.dispose();
  }
}

/**
 * Parse the active source file AND triage a log file, then combine both into
 * a single comprehensive triage report.
 */
async function triageAll(extensionUri: vscode.Uri): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showWarningMessage(
      'Triage Agent: No active editor. Open a source file first.'
    );
    return;
  }

  const logText = await getLogText();
  if (!logText) { return; }

  const panel = TriagePanel.createOrShow(extensionUri);
  panel.showLoading('Parsing source code and triaging logs…');

  const cancellation = new vscode.CancellationTokenSource();
  try {
    const config = vscode.workspace.getConfiguration('triageAgent');
    const maxLines = config.get<number>('maxLogLines', 500);
    const includeDiagnostics = config.get<boolean>('includeDiagnostics', true);

    const text = editor.document.getText();
    const filePath = editor.document.fileName;
    const parsedSource = parseSourceCode(text, filePath);
    const parsedLogs = parseLogs(logText, maxLines);
    const diagnostics = includeDiagnostics
      ? vscode.languages.getDiagnostics(editor.document.uri)
      : [];

    const result = await runTriageAgent(
      parsedLogs,
      parsedSource,
      diagnostics,
      cancellation.token
    );

    panel.update(result.report, 'Full Triage');
    void vscode.window.showInformationMessage(`Triage complete: ${result.summary}`);
  } catch (err) {
    panel.update(`## Error\n\n${String(err)}`);
    void vscode.window.showErrorMessage(`Triage failed: ${String(err)}`);
  } finally {
    cancellation.dispose();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Return the text of the active editor if it looks like a log file,
 * or prompt the user to open a `.log` / `.txt` file.
 */
async function getLogText(): Promise<string | null> {
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    const ext = editor.document.fileName.split('.').pop()?.toLowerCase();
    if (ext === 'log' || ext === 'txt' || ext === 'out') {
      return editor.document.getText();
    }
  }

  // Not a log file open — ask the user to pick one
  const uris = await vscode.window.showOpenDialog({
    canSelectMany: false,
    filters: { 'Log files': ['log', 'txt', 'out'], 'All files': ['*'] },
    openLabel: 'Select log file',
  });

  if (!uris || uris.length === 0) { return null; }

  const doc = await vscode.workspace.openTextDocument(uris[0]);
  return doc.getText();
}
