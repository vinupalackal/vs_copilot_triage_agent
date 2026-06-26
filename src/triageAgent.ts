/**
 * Triage agent — builds prompts from parsed source / log summaries and
 * calls the VS Code Language Model API (GitHub Copilot) to produce a
 * structured triage report.
 */

import * as vscode from 'vscode';
import { ParsedLogs, summariseLogs } from './logParser';
import { ParsedSource, summariseSource } from './sourceParser';

export interface TriageResult {
  summary: string;
  /** Markdown-formatted full report */
  report: string;
}

/**
 * Call the VS Code LM API with the supplied context and return a triage
 * report.  Falls back to a rule-based report when no LM is available.
 */
export async function runTriageAgent(
  logContext: ParsedLogs | null,
  sourceContext: ParsedSource | null,
  diagnostics: vscode.Diagnostic[],
  token: vscode.CancellationToken
): Promise<TriageResult> {
  const logSummary = logContext ? summariseLogs(logContext) : null;
  const sourceSummary = sourceContext ? summariseSource(sourceContext) : null;

  const promptParts: string[] = [
    'You are a software triage assistant. Analyse the following context and produce a concise triage report in Markdown.',
    'Your report must include:',
    '1. A one-sentence executive summary.',
    '2. A list of identified errors or issues, ordered by severity.',
    '3. Likely root causes for the top issues.',
    '4. Suggested next steps for investigation or remediation.',
    '',
  ];

  if (sourceSummary) {
    promptParts.push('## Source Code Context\n' + sourceSummary + '\n');
  }

  if (logSummary) {
    promptParts.push('## Log Context\n' + logSummary + '\n');
  }

  if (diagnostics.length > 0) {
    promptParts.push('## VS Code Diagnostics\n' + formatDiagnostics(diagnostics) + '\n');
  }

  promptParts.push('Please produce your triage report now.');

  const userPrompt = promptParts.join('\n');

  // Attempt to use the VS Code Language Model API (requires Copilot chat)
  try {
    const config = vscode.workspace.getConfiguration('triageAgent');
    const preferredModel = config.get<string>('model', 'copilot-gpt-4o');

    const [model] = await vscode.lm.selectChatModels({
      vendor: 'copilot',
      family: preferredModel,
    });

    if (model) {
      const messages = [
        vscode.LanguageModelChatMessage.User(userPrompt),
      ];

      const response = await model.sendRequest(messages, {}, token);
      let fullText = '';
      for await (const part of response.stream) {
        if (part instanceof vscode.LanguageModelTextPart) {
          fullText += part.value;
        }
      }

      return {
        summary: extractFirstSentence(fullText),
        report: fullText,
      };
    }
  } catch {
    // LM not available — fall through to rule-based report
  }

  // Fallback: rule-based report
  return buildRuleBasedReport(logContext, sourceContext, diagnostics);
}

// Helpers -----------------------------------------------------------------

function formatDiagnostics(diagnostics: vscode.Diagnostic[]): string {
  return diagnostics
    .slice(0, 20)
    .map(d => {
      const sev = vscode.DiagnosticSeverity[d.severity];
      const loc = `line ${d.range.start.line + 1}`;
      return `  [${sev}] ${loc}: ${d.message}`;
    })
    .join('\n');
}

function extractFirstSentence(text: string): string {
  const m = text.match(/[^.!?]*[.!?]/);
  return m ? m[0].trim() : text.slice(0, 120).trim();
}

function buildRuleBasedReport(
  logs: ParsedLogs | null,
  source: ParsedSource | null,
  diagnostics: vscode.Diagnostic[]
): TriageResult {
  const sections: string[] = [];

  // Executive summary
  const errorCount = logs?.errorCount ?? 0;
  const warnCount = logs?.warnCount ?? 0;
  const diagErrors = diagnostics.filter(
    d => d.severity === vscode.DiagnosticSeverity.Error
  ).length;

  const summaryLine =
    errorCount + diagErrors > 0
      ? `Found ${errorCount + diagErrors} error(s) and ${warnCount} warning(s) requiring attention.`
      : warnCount > 0
      ? `No errors detected; ${warnCount} warning(s) may need review.`
      : 'No significant issues detected.';

  sections.push(`## Triage Summary\n\n${summaryLine}`);

  // Issues
  if (logs && logs.entries.length > 0) {
    const issues = logs.entries
      .filter(e => e.level === 'ERROR' || e.level === 'WARN')
      .slice(0, 10)
      .map(e => {
        const ts = e.timestamp ? ` @ ${e.timestamp}` : '';
        return `- **[${e.level}]**${ts}: ${e.message}`;
      });

    if (issues.length > 0) {
      sections.push(`## Log Issues\n\n${issues.join('\n')}`);
    }
  }

  if (diagnostics.length > 0) {
    const diagList = diagnostics
      .slice(0, 10)
      .map(d => {
        const sev = vscode.DiagnosticSeverity[d.severity];
        return `- **[${sev}]** line ${d.range.start.line + 1}: ${d.message}`;
      });
    sections.push(`## Code Diagnostics\n\n${diagList.join('\n')}`);
  }

  // Source context
  if (source) {
    sections.push(
      `## Source Overview\n\n` +
      `**File:** ${source.filePath}  \n` +
      `**Language:** ${source.language}  \n` +
      `**LOC:** ${source.locCount}  \n` +
      `**Classes:** ${source.classCount}  \n` +
      `**Functions/Methods:** ${source.functionCount}  `
    );
  }

  // Suggested next steps
  const steps: string[] = [];
  if (errorCount > 0) {
    steps.push('- Investigate the ERROR entries in the log, starting with the earliest occurrence.');
  }
  if (warnCount > 0) {
    steps.push('- Review WARN entries to determine whether they indicate an impending failure.');
  }
  if (diagErrors > 0) {
    steps.push('- Fix the code diagnostics errors reported by VS Code before re-running.');
  }
  if (steps.length === 0) {
    steps.push('- No immediate action required; monitor for regressions.');
  }
  sections.push(`## Suggested Next Steps\n\n${steps.join('\n')}`);

  const report = sections.join('\n\n');
  return { summary: summaryLine, report };
}
