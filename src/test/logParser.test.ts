import * as assert from 'assert';
import { parseLogs, summariseLogs } from '../logParser';

suite('LogParser', () => {
  test('parses timestamped ERROR lines', () => {
    const text = '[2024-01-15 08:30:00] ERROR Something went wrong\n' +
      '[2024-01-15 08:30:01] INFO  All good\n' +
      '[2024-01-15 08:30:02] WARN  Disk usage high';

    const result = parseLogs(text);

    assert.strictEqual(result.errorCount, 1);
    assert.strictEqual(result.warnCount, 1);
    assert.strictEqual(result.infoCount, 1);
    assert.strictEqual(result.entries.length, 3);
    assert.strictEqual(result.entries[0].level, 'ERROR');
    assert.strictEqual(result.entries[0].message, 'Something went wrong');
    assert.strictEqual(result.entries[0].timestamp, '2024-01-15 08:30:00');
  });

  test('parses level-prefix lines without timestamp', () => {
    const text = 'ERROR: Database connection refused\nWARNING: Retry attempt 3\nINFO: Service started';
    const result = parseLogs(text);

    assert.strictEqual(result.errorCount, 1);
    assert.strictEqual(result.warnCount, 1);
    assert.strictEqual(result.infoCount, 1);
  });

  test('attaches stack trace lines to preceding entry', () => {
    const text =
      'ERROR: NullPointerException\n' +
      '    at com.example.Foo.bar(Foo.java:42)\n' +
      '    at com.example.Main.main(Main.java:10)\n' +
      'INFO: recovered';

    const result = parseLogs(text);

    assert.strictEqual(result.entries.length, 2);
    const errEntry = result.entries[0];
    assert.strictEqual(errEntry.level, 'ERROR');
    assert.ok(errEntry.stackTrace && errEntry.stackTrace.length === 2, 'should have 2 stack lines');
  });

  test('respects maxLines limit', () => {
    const lines = Array.from({ length: 100 }, (_, i) => `INFO: line ${i}`).join('\n');
    const result = parseLogs(lines, 10);
    assert.strictEqual(result.entries.length, 10);
  });

  test('handles empty input', () => {
    const result = parseLogs('');
    assert.strictEqual(result.entries.length, 0);
    assert.strictEqual(result.errorCount, 0);
  });

  test('summariseLogs produces non-empty string', () => {
    const text = 'ERROR: Boom\nINFO: started';
    const parsed = parseLogs(text);
    const summary = summariseLogs(parsed);
    assert.ok(summary.length > 0);
    assert.ok(summary.includes('error'));
  });

  test('parses ISO-8601 timestamp format', () => {
    const text = '[2024-06-01T09:15:30.123Z] ERROR Connection timeout';
    const result = parseLogs(text);
    assert.strictEqual(result.errorCount, 1);
    assert.strictEqual(result.entries[0].timestamp, '2024-06-01T09:15:30.123Z');
  });

  test('counts WARN lines from WARNING keyword', () => {
    const text = 'WARNING: low memory\nWARN: disk full';
    const result = parseLogs(text);
    assert.strictEqual(result.warnCount, 2);
  });
});
