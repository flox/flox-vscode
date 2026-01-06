/**
 * VSCode Test CLI Configuration
 *
 * Defines test configurations for running unit and integration tests.
 * Tests run in VSCode's Extension Development Host.
 *
 * Usage:
 *   npm test              - Run all tests
 *   npm run test:unit     - Run unit tests only (fast, mocked)
 *   npm run test:integration - Run integration tests (requires Flox CLI)
 *
 * @see https://code.visualstudio.com/api/working-with-extensions/testing-extension
 */
import { defineConfig } from '@vscode/test-cli';

export default defineConfig([
  {
    // Unit tests - fast, mocked dependencies, no external requirements
    label: 'unit',
    files: 'out/test/unit/**/*.test.js',
    mocha: {
      timeout: 10000,  // 10 seconds per test
      ui: 'tdd',       // Use suite/test syntax
    },
  },
  {
    // Integration tests - slower, requires VSCode and optionally Flox CLI
    label: 'integration',
    files: 'out/test/integration/**/*.test.js',
    workspaceFolder: './test-fixtures/workspace',
    mocha: {
      timeout: 60000,  // 60 seconds per test (Flox operations can be slow)
      ui: 'tdd',
    },
  },
]);
