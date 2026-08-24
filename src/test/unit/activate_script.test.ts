/**
 * Unit tests for scripts/activate.sh JSON escaping
 *
 * The activate script serializes all environment variables to JSON and sends
 * them over the Node IPC channel. If json_escape() produces invalid JSON
 * (e.g. raw ANSI escape codes from PS1/LS_COLORS), Node's internal JSON.parse
 * throws, the 'message' event never fires, and activation hangs forever
 * (issue #293).
 *
 * Why test this?
 * - Any user with ANSI colors in their prompt variables hits this bug
 * - The failure mode is a silent, indefinite hang with no error surfaced
 * - The escaping logic lives in bash, so it is not covered by TS unit tests
 *
 * These tests extract json_escape() from the script and verify its output
 * round-trips through JSON.parse for control characters, unicode, and the
 * standard escape sequences.
 */

import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { execFileSync } from 'child_process';

const SCRIPT_PATH = path.join(__dirname, '..', '..', '..', 'scripts', 'activate.sh');

/**
 * Extract the json_escape() function body from activate.sh so we test the
 * exact code that ships. Extraction happens in Node because the test electron
 * host runs with a stripped PATH (no sed available).
 */
function extractJsonEscape(): string {
  const script = fs.readFileSync(SCRIPT_PATH, 'utf8');
  const match = script.match(/^json_escape\(\)[\s\S]*?^\}/m);
  assert.ok(match, 'json_escape() not found in scripts/activate.sh');
  return match[0];
}

/**
 * Run json_escape() from activate.sh on the given input and return its output.
 * json_escape uses only bash builtins, so an empty PATH is fine; /bin/bash is
 * used directly because bash itself is not on the test host PATH either.
 */
function jsonEscape(input: string): string {
  const bashSnippet = `${extractJsonEscape()}\njson_escape "$1"`;
  return execFileSync('/bin/bash', ['-c', bashSnippet, 'bash', input], {
    encoding: 'utf8',
  }).replace(/\n$/, '');
}

/**
 * Escape input via the script and parse it back through JSON.parse,
 * exactly like the Node IPC channel does.
 */
function roundTrip(input: string): string {
  const escaped = jsonEscape(input);
  return JSON.parse(`{"v":"${escaped}"}`).v;
}

suite('activate.sh json_escape Unit Tests', () => {
  suite('Control Characters (issue #293)', () => {
    test('should escape ANSI color sequences (ESC, 0x1b)', () => {
      const input = '\x1b[01;32m>\x1b[00m ';
      assert.strictEqual(roundTrip(input), input);
    });

    test('should escape all ASCII control characters below 0x20', () => {
      // NUL (0x00) excluded: bash strings cannot contain it, and env -0
      // uses it as the entry separator so it can never appear in a value.
      for (let code = 1; code < 32; code++) {
        const input = `a${String.fromCharCode(code)}b`;
        assert.strictEqual(
          roundTrip(input),
          input,
          `control character 0x${code.toString(16).padStart(2, '0')} did not round-trip`
        );
      }
    });
  });

  suite('Standard Escapes', () => {
    test('should escape double quotes and backslashes', () => {
      const input = 'quote"back\\slash';
      assert.strictEqual(roundTrip(input), input);
    });

    test('should escape newlines and tabs', () => {
      const input = 'multi\nline\tvalue';
      assert.strictEqual(roundTrip(input), input);
    });
  });

  suite('Pass-through', () => {
    test('should pass through multi-byte UTF-8 unchanged', () => {
      const input = 'café ☕ žšč';
      assert.strictEqual(roundTrip(input), input);
    });

    test('should pass through plain ASCII unchanged', () => {
      const input = 'PATH=/usr/bin:/bin';
      assert.strictEqual(roundTrip(input), input);
    });
  });
});
