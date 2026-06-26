/**
 * Log parser — extracts structured log entries from plain-text log files.
 *
 * Supports common log formats:
 *   - Timestamped lines:   [2024-01-01 12:00:00] ERROR  Something went wrong
 *   - Level-prefixed lines: ERROR: Something went wrong
 *   - Stack trace lines attached to the preceding log entry
 */

export type LogLevel = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'TRACE' | 'UNKNOWN';

export interface LogEntry {
  /** Zero-based line index in the original text */
  lineIndex: number;
  level: LogLevel;
  timestamp?: string;
  message: string;
  /** Any stack trace / continuation lines that belong to this entry */
  stackTrace?: string[];
}

export interface ParsedLogs {
  entries: LogEntry[];
  errorCount: number;
  warnCount: number;
  infoCount: number;
  otherCount: number;
}

// Patterns ----------------------------------------------------------------

/** [2024-01-15 08:30:00] ERROR  message … */
const TIMESTAMPED_RE =
  /^\[?(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)\]?\s+(ERROR|WARN(?:ING)?|INFO|DEBUG|TRACE)\s*:?\s+(.*)/i;

/** ERROR: message  (no timestamp) */
const LEVEL_PREFIX_RE =
  /^(ERROR|WARN(?:ING)?|INFO|DEBUG|TRACE)\s*:?\s+(.*)/i;

/** Typical stack trace line – starts with whitespace + "at" or "Caused by" */
const STACK_TRACE_RE = /^(\s+at\s|\s*Caused by:|\s+\.{3}\s+\d+ more)/;

// Helpers -----------------------------------------------------------------

function normaliseLevel(raw: string): LogLevel {
  const upper = raw.toUpperCase();
  if (upper === 'ERROR') { return 'ERROR'; }
  if (upper.startsWith('WARN')) { return 'WARN'; }
  if (upper === 'INFO') { return 'INFO'; }
  if (upper === 'DEBUG') { return 'DEBUG'; }
  if (upper === 'TRACE') { return 'TRACE'; }
  return 'UNKNOWN';
}

// Public API --------------------------------------------------------------

/**
 * Parse a block of raw log text into structured {@link LogEntry} objects.
 *
 * @param text     Raw log content (newline-separated).
 * @param maxLines Maximum number of lines to process (default: 500).
 */
export function parseLogs(text: string, maxLines = 500): ParsedLogs {
  const lines = text.split(/\r?\n/).slice(0, maxLines);
  const entries: LogEntry[] = [];
  let current: LogEntry | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Try to attach to a running stack trace
    if (current && STACK_TRACE_RE.test(line)) {
      (current.stackTrace ??= []).push(line);
      continue;
    }

    // Try timestamped format
    const tsMatch = TIMESTAMPED_RE.exec(line);
    if (tsMatch) {
      current = {
        lineIndex: i,
        level: normaliseLevel(tsMatch[2]),
        timestamp: tsMatch[1],
        message: tsMatch[3].trim(),
      };
      entries.push(current);
      continue;
    }

    // Try level-prefix format
    const lvlMatch = LEVEL_PREFIX_RE.exec(line);
    if (lvlMatch) {
      current = {
        lineIndex: i,
        level: normaliseLevel(lvlMatch[1]),
        message: lvlMatch[2].trim(),
      };
      entries.push(current);
      continue;
    }

    // Plain (non-structured) line — create an UNKNOWN entry but keep
    // tracking so that subsequent stack-trace lines attach correctly.
    if (line.trim().length > 0) {
      current = {
        lineIndex: i,
        level: 'UNKNOWN',
        message: line.trim(),
      };
      entries.push(current);
    }
  }

  return {
    entries,
    errorCount: entries.filter(e => e.level === 'ERROR').length,
    warnCount: entries.filter(e => e.level === 'WARN').length,
    infoCount: entries.filter(e => e.level === 'INFO').length,
    otherCount: entries.filter(
      e => e.level !== 'ERROR' && e.level !== 'WARN' && e.level !== 'INFO'
    ).length,
  };
}

/**
 * Produce a compact human-readable plain-text summary of the parsed logs,
 * suitable for inclusion in a Copilot prompt.
 */
export function summariseLogs(parsed: ParsedLogs): string {
  const { entries, errorCount, warnCount, infoCount, otherCount } = parsed;
  const total = entries.length;
  const lines: string[] = [
    `Log summary: ${total} entries — ${errorCount} error(s), ${warnCount} warning(s), ${infoCount} info, ${otherCount} other.`,
  ];

  // Include all error entries (with stack traces) then warnings
  const notable = entries.filter(e => e.level === 'ERROR' || e.level === 'WARN');
  if (notable.length > 0) {
    lines.push('\nNotable entries:');
    for (const entry of notable) {
      const ts = entry.timestamp ? `[${entry.timestamp}] ` : '';
      lines.push(`  Line ${entry.lineIndex + 1}: ${ts}[${entry.level}] ${entry.message}`);
      if (entry.stackTrace && entry.stackTrace.length > 0) {
        lines.push(entry.stackTrace.slice(0, 5).join('\n'));
        if (entry.stackTrace.length > 5) {
          lines.push(`    … (${entry.stackTrace.length - 5} more stack lines)`);
        }
      }
    }
  }

  return lines.join('\n');
}
