import * as assert from 'assert';
import { parseSourceCode, detectLanguage, summariseSource } from '../sourceParser';

suite('SourceParser', () => {
  test('detectLanguage returns correct language for extensions', () => {
    assert.strictEqual(detectLanguage('app.ts'), 'TypeScript');
    assert.strictEqual(detectLanguage('script.js'), 'JavaScript');
    assert.strictEqual(detectLanguage('main.py'), 'Python');
    assert.strictEqual(detectLanguage('Main.java'), 'Java');
    assert.strictEqual(detectLanguage('app.go'), 'Go');
    assert.strictEqual(detectLanguage('lib.rs'), 'Rust');
    assert.strictEqual(detectLanguage('unknown.xyz'), 'Unknown');
  });

  test('parses TypeScript classes and functions', () => {
    const src = `
import * as vscode from 'vscode';

export class MyService {
  private value: string;

  constructor(v: string) {
    this.value = v;
  }

  async doWork(): Promise<void> {
    console.log(this.value);
  }
}

export function helperFn(x: number): number {
  return x * 2;
}
`;
    const parsed = parseSourceCode(src, 'src/service.ts');

    assert.strictEqual(parsed.language, 'TypeScript');
    assert.ok(parsed.classCount >= 1, 'should detect at least one class');
    assert.ok(parsed.functionCount >= 1, 'should detect at least one function');
    assert.ok(parsed.importCount >= 1, 'should detect at least one import');
  });

  test('parses Python functions and classes', () => {
    const src = `
import os
from typing import List

class DataProcessor:
    def __init__(self):
        pass

    def process(self, data: List[str]) -> None:
        pass

def main():
    pass
`;
    const parsed = parseSourceCode(src, 'processor.py');

    assert.strictEqual(parsed.language, 'Python');
    assert.ok(parsed.classCount >= 1, 'should detect class');
    assert.ok(parsed.functionCount >= 1, 'should detect function(s)');
    assert.ok(parsed.importCount >= 1, 'should detect imports');
  });

  test('counts lines of code (excludes blank + comment lines)', () => {
    const src = `// This is a comment
function foo() {
  // inner comment
  return 42;
}
`;
    const parsed = parseSourceCode(src, 'foo.js');
    // Only "function foo() {" and "return 42;" and "}" count as LOC
    assert.ok(parsed.locCount >= 2, 'should count at least 2 LOC');
    assert.ok(parsed.locCount < 6, 'should not count comment/blank lines');
  });

  test('summariseSource returns non-empty string with file path', () => {
    const src = 'class Foo {}\nfunction bar() {}';
    const parsed = parseSourceCode(src, 'test.ts');
    const summary = summariseSource(parsed);
    assert.ok(summary.includes('test.ts'));
    assert.ok(summary.length > 0);
  });

  test('handles empty source file gracefully', () => {
    const parsed = parseSourceCode('', 'empty.ts');
    assert.strictEqual(parsed.symbols.length, 0);
    assert.strictEqual(parsed.locCount, 0);
  });

  test('parses Go functions', () => {
    const src = `
package main

import "fmt"

func main() {
    fmt.Println("hello")
}

func add(a, b int) int {
    return a + b
}
`;
    const parsed = parseSourceCode(src, 'main.go');
    assert.strictEqual(parsed.language, 'Go');
    assert.ok(parsed.functionCount >= 2, 'should detect 2 functions');
  });
});
