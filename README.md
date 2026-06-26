# VS Copilot Triage Agent

A Visual Studio Code extension that **parses source code** and **triages log files** to produce an AI-powered summary using GitHub Copilot.

## Features

| Command | Description |
|---|---|
| **Triage Agent: Triage Logs** | Parse the active log file (or pick one) and generate a triage report |
| **Triage Agent: Parse Source Code** | Analyse the active source file and summarise its structure and diagnostics |
| **Triage Agent: Parse Source & Triage Logs** | Combined — parse a source file **and** triage a log file together |

### How it works

1. **Source parser** — extracts classes, functions, imports, and line counts from the active source file (TypeScript, JavaScript, Python, Java, C#, Go, Rust, and more).  
2. **Log parser** — identifies `ERROR`, `WARN`, `INFO`, `DEBUG` entries from standard log formats (timestamped and plain level-prefix) and attaches stack-trace lines to their parent entry.  
3. **Triage agent** — builds a structured prompt from the extracted context and calls the VS Code Language Model API (GitHub Copilot) to generate a Markdown triage report. Falls back to a deterministic rule-based report when Copilot is not available.  
4. **Triage panel** — renders the Markdown report in a side-by-side WebviewPanel.

## Requirements

- VS Code ≥ 1.90
- GitHub Copilot (optional — the extension falls back to rule-based analysis if unavailable)

## Extension Settings

| Setting | Default | Description |
|---|---|---|
| `triageAgent.maxLogLines` | `500` | Maximum log lines sent to the triage agent |
| `triageAgent.includeDiagnostics` | `true` | Include VS Code error/warning diagnostics in the report |
| `triageAgent.model` | `copilot-gpt-4o` | Copilot language model family to use |

## Development

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch mode
npm run watch

# Run unit tests (no VS Code instance required)
npm run test:unit

# Lint
npm run lint
```

Press **F5** in VS Code to open an Extension Development Host and test the extension interactively.

## Project Structure

```
src/
├── extension.ts      # Entry point — registers commands
├── logParser.ts      # Log file parsing utilities
├── sourceParser.ts   # Source code structure extraction
├── triageAgent.ts    # Copilot LM API integration + rule-based fallback
├── triagePanel.ts    # WebviewPanel rendering
└── test/
    ├── logParser.test.ts    # Unit tests for log parser
    └── sourceParser.test.ts # Unit tests for source parser
```
