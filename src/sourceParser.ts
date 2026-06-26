/**
 * Source code parser — extracts a structural overview of a source file so
 * that it can be included as context when triaging logs with Copilot.
 *
 * Uses simple regex heuristics rather than a full AST so that it works
 * across the most common languages (TypeScript/JavaScript, Python, Java,
 * C#, Go, Rust) without pulling in heavy language-specific parsers.
 */

export interface SourceSymbol {
  kind: 'function' | 'class' | 'method' | 'import' | 'constant' | 'variable';
  name: string;
  /** 1-based line number */
  line: number;
}

export interface ParsedSource {
  language: string;
  filePath: string;
  symbols: SourceSymbol[];
  importCount: number;
  functionCount: number;
  classCount: number;
  /** Approximate lines of code (non-blank, non-comment) */
  locCount: number;
}

// Language detection ------------------------------------------------------

const LANGUAGE_EXT_MAP: Record<string, string> = {
  ts: 'TypeScript',
  tsx: 'TypeScript',
  js: 'JavaScript',
  jsx: 'JavaScript',
  mjs: 'JavaScript',
  py: 'Python',
  java: 'Java',
  cs: 'C#',
  cpp: 'C++',
  cc: 'C++',
  cxx: 'C++',
  c: 'C',
  h: 'C/C++ Header',
  go: 'Go',
  rs: 'Rust',
  rb: 'Ruby',
  php: 'PHP',
  swift: 'Swift',
  kt: 'Kotlin',
};

export function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  return LANGUAGE_EXT_MAP[ext] ?? 'Unknown';
}

// Per-language regex patterns --------------------------------------------

interface LangPatterns {
  importRe?: RegExp;
  functionRe?: RegExp;
  classRe?: RegExp;
  methodRe?: RegExp;
  constRe?: RegExp;
  commentLineRe?: RegExp;
}

function getPatternsForLanguage(lang: string): LangPatterns {
  switch (lang) {
    case 'TypeScript':
    case 'JavaScript':
      return {
        importRe: /^\s*(?:import|export\s+\{|require\s*\()/,
        functionRe:
          /(?:^|\s)(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/,
        classRe: /^\s*(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][A-Za-z0-9_$]*)/,
        methodRe:
          /^\s+(?:(?:public|private|protected|static|async|override)\s+)*([A-Za-z_$][A-Za-z0-9_$]*)\s*\([^)]*\)\s*(?::\s*\S+\s*)?\{/,
        constRe: /^\s*(?:export\s+)?const\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=/,
        commentLineRe: /^\s*(?:\/\/|\/\*|\*)/,
      };
    case 'Python':
      return {
        importRe: /^\s*(?:import|from)\s+/,
        functionRe: /^\s*(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/,
        classRe: /^\s*class\s+([A-Za-z_][A-Za-z0-9_]*)\s*[:(]/,
        commentLineRe: /^\s*#/,
      };
    case 'Java':
    case 'C#':
    case 'Kotlin':
      return {
        importRe: /^\s*(?:import|using)\s+/,
        classRe:
          /^\s*(?:public|private|protected|internal|abstract|sealed|static|\s)*class\s+([A-Za-z_][A-Za-z0-9_]*)/,
        methodRe:
          /^\s+(?:(?:public|private|protected|static|override|virtual|async|sealed|abstract|readonly)\s+)*\S+\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)\s*(?:throws\s+\S+\s*)?\{/,
        commentLineRe: /^\s*(?:\/\/|\/\*|\*)/,
      };
    case 'Go':
      return {
        importRe: /^\s*import\s*/,
        functionRe: /^\s*func\s+(?:\([^)]+\)\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\(/,
        commentLineRe: /^\s*\/\//,
      };
    case 'Rust':
      return {
        importRe: /^\s*use\s+/,
        functionRe: /^\s*(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/,
        classRe: /^\s*(?:pub\s+)?struct\s+([A-Za-z_][A-Za-z0-9_]*)/,
        commentLineRe: /^\s*\/\//,
      };
    default:
      return {
        importRe: /^\s*(?:import|include|require|use)\s+/,
        functionRe: /(?:function|def|func|fn)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/,
        commentLineRe: /^\s*(?:\/\/|#|\/\*)/,
      };
  }
}

// Public API --------------------------------------------------------------

/**
 * Parse a source file's text into a structured {@link ParsedSource} summary.
 *
 * @param text     The raw source code.
 * @param filePath File path (used to detect language and for display).
 */
export function parseSourceCode(text: string, filePath: string): ParsedSource {
  const language = detectLanguage(filePath);
  const patterns = getPatternsForLanguage(language);
  const lines = text.split(/\r?\n/);

  const symbols: SourceSymbol[] = [];
  let locCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;

    // Count non-blank, non-comment lines
    if (
      line.trim().length > 0 &&
      !(patterns.commentLineRe?.test(line))
    ) {
      locCount++;
    }

    if (patterns.importRe?.test(line)) {
      // Imports: just count, don't add to symbols to keep noise low
      symbols.push({ kind: 'import', name: line.trim().slice(0, 60), line: lineNo });
      continue;
    }

    const classMatch = patterns.classRe?.exec(line);
    if (classMatch) {
      symbols.push({ kind: 'class', name: classMatch[1], line: lineNo });
      continue;
    }

    const fnMatch = patterns.functionRe?.exec(line);
    if (fnMatch) {
      symbols.push({ kind: 'function', name: fnMatch[1], line: lineNo });
      continue;
    }

    const methodMatch = patterns.methodRe?.exec(line);
    if (methodMatch) {
      symbols.push({ kind: 'method', name: methodMatch[1], line: lineNo });
      continue;
    }

    const constMatch = patterns.constRe?.exec(line);
    if (constMatch) {
      symbols.push({ kind: 'constant', name: constMatch[1], line: lineNo });
    }
  }

  return {
    language,
    filePath,
    symbols,
    importCount: symbols.filter(s => s.kind === 'import').length,
    functionCount: symbols.filter(s => s.kind === 'function' || s.kind === 'method').length,
    classCount: symbols.filter(s => s.kind === 'class').length,
    locCount,
  };
}

/**
 * Produce a compact plain-text description of a parsed source file,
 * suitable for inclusion in a Copilot prompt.
 */
export function summariseSource(parsed: ParsedSource): string {
  const lines: string[] = [
    `File: ${parsed.filePath}`,
    `Language: ${parsed.language}`,
    `Lines of code (approx.): ${parsed.locCount}`,
    `Imports: ${parsed.importCount}, Classes: ${parsed.classCount}, Functions/Methods: ${parsed.functionCount}`,
  ];

  const nonImports = parsed.symbols.filter(s => s.kind !== 'import');
  if (nonImports.length > 0) {
    lines.push('\nSymbols:');
    for (const sym of nonImports) {
      lines.push(`  [${sym.kind}] ${sym.name}  (line ${sym.line})`);
    }
  }

  return lines.join('\n');
}
