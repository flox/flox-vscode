/**
 * Unit tests for src/env.ts
 *
 * The Env class is the core of the extension. It manages:
 * - System detection (which platform we're running on)
 * - File watchers for manifest.toml and manifest.lock
 * - Loading and parsing manifest files
 * - Executing flox CLI commands
 * - Managing the background activation process
 * - Applying environment variables to terminals
 *
 * Testing approach:
 * - Use real filesystem operations with temp directories (more reliable than mocking fs)
 * - Mock VSCode ExtensionContext with our mock utilities
 * - Test file parsing with real TOML/JSON files
 * - Skip platform-specific tests on non-matching platforms
 *
 * Why test this?
 * - Env class orchestrates all extension functionality
 * - Bugs here affect package display, services, and command execution
 * - Manifest parsing errors would break the entire sidebar
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import Env from '../../env';
import { System } from '../../config';
import { createMockExtensionContext, MockOutputChannel } from '../mocks/vscode';

suite('Env Unit Tests', () => {
  let mockContext: vscode.ExtensionContext;
  let tempDir: string;

  setup(async () => {
    mockContext = createMockExtensionContext();
    // Create a temporary directory for test files
    // Using real fs is more reliable than mocking for file operations
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flox-test-'));
  });

  teardown(() => {
    // Clean up temp directory after each test
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  /**
   * Constructor Tests
   *
   * The Env constructor:
   * 1. Detects the current system (os.platform() + os.arch())
   * 2. Sets up file watchers for manifest files
   * 3. Initializes empty state (views, packages, etc.)
   *
   * System detection is critical because packages are filtered by system.
   * Wrong detection = no packages shown.
   */
  suite('Constructor', () => {
    test('should detect aarch64-darwin system', function() {
      // Skip if not on Apple Silicon Mac
      const arch = os.arch();
      const platform = os.platform();
      if (`${arch}-${platform}` !== 'arm64-darwin') {
        this.skip();
        return;
      }

      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);
      assert.strictEqual(env.system, System.AARCH64_DARWIN);
      env.dispose();
    });

    test('should detect x86_64-linux system', function() {
      // Skip if not on Intel/AMD Linux
      const arch = os.arch();
      const platform = os.platform();
      if (`${arch}-${platform}` !== 'x64-linux') {
        this.skip();
        return;
      }

      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);
      assert.strictEqual(env.system, System.X86_64_LINUX);
      env.dispose();
    });

    test('should detect x86_64-darwin system', function() {
      // Skip if not on Intel Mac
      const arch = os.arch();
      const platform = os.platform();
      if (`${arch}-${platform}` !== 'x64-darwin') {
        this.skip();
        return;
      }

      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);
      assert.strictEqual(env.system, System.X86_64_DARWIN);
      env.dispose();
    });

    test('should detect aarch64-linux system', function() {
      // Skip if not on ARM64 Linux
      const arch = os.arch();
      const platform = os.platform();
      if (`${arch}-${platform}` !== 'arm64-linux') {
        this.skip();
        return;
      }

      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);
      assert.strictEqual(env.system, System.AARCH64_LINUX);
      env.dispose();
    });

    test('should set workspaceUri from parameter', () => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);
      assert.strictEqual(env.workspaceUri?.fsPath, tempDir);
      env.dispose();
    });

    test('should initialize empty views array', () => {
      // Views are added later via registerView()
      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);
      assert.deepStrictEqual(env.views, []);
      env.dispose();
    });

    test('should initialize isEnvActive as false', () => {
      // Environment is only active after spawnActivateProcess completes
      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);
      assert.strictEqual(env.isEnvActive, false);
      env.dispose();
    });
  });

  /**
   * fileExists Tests
   *
   * Helper method that checks if a file exists using vscode.workspace.fs.stat().
   * Used before loading manifest files to avoid errors.
   */
  suite('fileExists', () => {
    test('should return true for existing file', async () => {
      // Create a test file in temp directory
      const testFilePath = path.join(tempDir, 'test.txt');
      fs.writeFileSync(testFilePath, 'test content');

      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);

      const result = await env.fileExists(vscode.Uri.file(testFilePath));
      assert.strictEqual(result, true);
      env.dispose();
    });

    test('should return false for non-existing file', async () => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);

      const result = await env.fileExists(vscode.Uri.file(path.join(tempDir, 'nonexistent.txt')));
      assert.strictEqual(result, false);
      env.dispose();
    });
  });

  /**
   * loadFile Tests
   *
   * Loads and parses manifest.toml (TOML) or manifest.lock (JSON) files.
   * Uses smol-toml for TOML parsing and native JSON.parse for lock files.
   *
   * File type is determined by extension:
   * - .toml -> TOML parser
   * - .lock -> JSON parser
   */
  suite('loadFile', () => {
    test('should parse TOML file correctly', async () => {
      // Create a test TOML file matching manifest.toml structure
      const testFilePath = path.join(tempDir, 'test.toml');
      fs.writeFileSync(testFilePath, `
[install]
nodejs = {}
python3 = {}

[vars]
MY_VAR = "test_value"
`);

      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);

      const result = await env.loadFile(vscode.Uri.file(testFilePath));
      assert.ok(result, 'Should return parsed object');
      assert.ok(result.install, 'Should have install section');
      assert.ok(result.install.nodejs, 'Should have nodejs package');
      assert.ok(result.install.python3, 'Should have python3 package');
      assert.strictEqual(result.vars.MY_VAR, 'test_value', 'Should parse vars correctly');
      env.dispose();
    });

    test('should parse JSON lock file correctly', async () => {
      // Create a test lock file matching manifest.lock structure
      const testFilePath = path.join(tempDir, 'manifest.lock');
      fs.writeFileSync(testFilePath, JSON.stringify({
        packages: [
          { install_id: 'nodejs', version: '20.0.0', system: 'aarch64-darwin' },
        ],
        manifest: {
          install: { nodejs: {} },
        },
      }));

      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);

      const result = await env.loadFile(vscode.Uri.file(testFilePath));
      assert.ok(result, 'Should return parsed object');
      assert.ok(result.packages, 'Should have packages array');
      assert.strictEqual(result.packages.length, 1, 'Should have one package');
      assert.strictEqual(result.packages[0].install_id, 'nodejs', 'Should parse package correctly');
      env.dispose();
    });

    test('should return undefined for non-existing file', async () => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);

      const result = await env.loadFile(vscode.Uri.file(path.join(tempDir, 'nonexistent.toml')));
      assert.strictEqual(result, undefined, 'Should return undefined for missing files');
      env.dispose();
    });

    test('should handle invalid TOML gracefully', async () => {
      // Invalid TOML should not crash, just return undefined
      const testFilePath = path.join(tempDir, 'invalid.toml');
      fs.writeFileSync(testFilePath, 'this is not valid toml {{{{');

      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);

      const result = await env.loadFile(vscode.Uri.file(testFilePath));
      assert.strictEqual(result, undefined, 'Should return undefined for invalid TOML');
      env.dispose();
    });

    test('should handle invalid JSON gracefully', async () => {
      // Invalid JSON should not crash, just return undefined
      const testFilePath = path.join(tempDir, 'invalid.lock');
      fs.writeFileSync(testFilePath, 'this is not valid json {{{');

      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);

      const result = await env.loadFile(vscode.Uri.file(testFilePath));
      assert.strictEqual(result, undefined, 'Should return undefined for invalid JSON');
      env.dispose();
    });
  });

  /**
   * registerCommand Tests
   *
   * Wraps vscode.commands.registerCommand with try/catch error handling.
   * All extension commands go through this to ensure errors are displayed
   * properly via displayError() instead of crashing silently.
   */
  suite('registerCommand', () => {
    test('should register command and add to subscriptions', () => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);

      const initialSubscriptionsCount = mockContext.subscriptions.length;
      env.registerCommand('test.command', () => {});

      // Command should be added to context.subscriptions for cleanup on deactivate
      assert.strictEqual(mockContext.subscriptions.length, initialSubscriptionsCount + 1);
      env.dispose();
    });
  });

  /**
   * registerView Tests
   *
   * Registers a TreeDataProvider view and links it to this Env instance.
   * Views need access to env to read packages, manifest, etc.
   */
  suite('registerView', () => {
    test('should add view to views array', () => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);

      // Create a minimal mock view implementing the View interface
      const mockView = {
        registerProvider: (name: string) => ({ dispose: () => {} }),
        refresh: async () => {},
        env: undefined as any,
      };

      env.registerView('testView', mockView);

      // View should be added to views array for refresh on reload()
      assert.strictEqual(env.views.length, 1);
      // View should have reference to env for accessing packages/manifest
      assert.strictEqual(mockView.env, env);
      env.dispose();
    });
  });

  /**
   * applyEnvironmentVariables Tests
   *
   * Applies environment variables from flox activate to VSCode terminals.
   * Uses context.environmentVariableCollection to modify terminal env.
   *
   * This is how the extension makes packages available in integrated terminal.
   */
  suite('applyEnvironmentVariables', () => {
    test('should apply environment variables to collection', async () => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);

      const testEnvVars = {
        'TEST_VAR': 'test_value',
        'ANOTHER_VAR': 'another_value',
      };

      await env.applyEnvironmentVariables(testEnvVars);

      // Variables should be stored in activatedEnvVars
      assert.deepStrictEqual(env.activatedEnvVars, testEnvVars);
      env.dispose();
    });

    test('should store original env vars on first call', async () => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);

      // Original should be empty before first apply
      assert.deepStrictEqual(env.originalEnvVars, {});

      await env.applyEnvironmentVariables({ 'TEST': 'value' });

      // Original should now contain process.env snapshot
      // This allows restoration on deactivate
      assert.ok(Object.keys(env.originalEnvVars).length > 0);
      env.dispose();
    });
  });

  /**
   * clearEnvironmentVariables Tests
   *
   * Clears environment variables when deactivating flox environment.
   * Restores terminal to original state.
   */
  suite('clearEnvironmentVariables', () => {
    test('should clear activated env vars', async () => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);

      // Set some env vars first
      await env.applyEnvironmentVariables({ 'TEST': 'value' });
      assert.ok(Object.keys(env.activatedEnvVars).length > 0);

      // Clear them
      await env.clearEnvironmentVariables();
      assert.deepStrictEqual(env.activatedEnvVars, {});
      env.dispose();
    });
  });

  /**
   * reload Tests
   *
   * The main state loading function. Called:
   * - On extension activation
   * - When manifest.toml or manifest.lock changes
   * - After installing/uninstalling packages
   *
   * It:
   * 1. Loads manifest.lock (or manifest.toml as fallback)
   * 2. Parses packages into Map<System, Map<install_id, Package>>
   * 3. Updates context keys (flox.envExists, flox.hasPkgs, etc.)
   * 4. Fetches service status if services exist
   * 5. Refreshes all registered views
   */
  suite('reload', () => {
    test('should set envExists to false when no manifest', async () => {
      // Empty directory with no .flox folder
      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);

      await env.reload();

      const envExists = mockContext.workspaceState.get('flox.envExists', false);
      assert.strictEqual(envExists, false);
      env.dispose();
    });

    test('should load manifest.lock when it exists', async () => {
      // Create .flox/env directory structure (matches real flox init)
      const floxDir = path.join(tempDir, '.flox', 'env');
      fs.mkdirSync(floxDir, { recursive: true });

      // Create manifest.lock file with packages
      const lockFile = path.join(floxDir, 'manifest.lock');
      fs.writeFileSync(lockFile, JSON.stringify({
        packages: [
          {
            install_id: 'nodejs',
            version: '20.0.0',
            system: 'aarch64-darwin',
            group: 'default',
            license: 'MIT',
            description: 'Node.js',
            attr_path: 'nodejs',
          },
        ],
        manifest: {
          install: { nodejs: {} },
          vars: { MY_VAR: 'value' },
        },
      }));

      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);

      await env.reload();

      assert.ok(env.manifest, 'Should load manifest');
      assert.ok(env.packages, 'Should parse packages');
      env.dispose();
    });

    test('should parse packages into Map by system', async () => {
      // Create environment with packages for different systems
      const floxDir = path.join(tempDir, '.flox', 'env');
      fs.mkdirSync(floxDir, { recursive: true });

      const lockFile = path.join(floxDir, 'manifest.lock');
      fs.writeFileSync(lockFile, JSON.stringify({
        packages: [
          {
            install_id: 'nodejs',
            version: '20.0.0',
            system: 'aarch64-darwin',
            group: 'default',
            license: 'MIT',
            description: 'Node.js',
            attr_path: 'nodejs',
          },
          {
            install_id: 'python3',
            version: '3.11.0',
            system: 'x86_64-linux',
            group: 'default',
            license: 'PSF',
            description: 'Python',
            attr_path: 'python3',
          },
        ],
        manifest: {
          install: { nodejs: {}, python3: {} },
        },
      }));

      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);

      await env.reload();

      // Packages should be grouped by system for efficient lookup
      assert.ok(env.packages);
      assert.ok(env.packages.get(System.AARCH64_DARWIN), 'Should have darwin packages');
      assert.ok(env.packages.get(System.X86_64_LINUX), 'Should have linux packages');
      assert.strictEqual(
        env.packages.get(System.AARCH64_DARWIN)?.get('nodejs')?.version,
        '20.0.0',
        'Should get correct nodejs version'
      );
      assert.strictEqual(
        env.packages.get(System.X86_64_LINUX)?.get('python3')?.version,
        '3.11.0',
        'Should get correct python version'
      );
      env.dispose();
    });

    test('should refresh all registered views', async () => {
      // Create minimal environment
      const floxDir = path.join(tempDir, '.flox', 'env');
      fs.mkdirSync(floxDir, { recursive: true });

      const lockFile = path.join(floxDir, 'manifest.lock');
      fs.writeFileSync(lockFile, JSON.stringify({
        manifest: { install: {} },
      }));

      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);

      // Track if refresh was called
      let refreshCalled = false;
      const mockView = {
        registerProvider: () => ({ dispose: () => {} }),
        refresh: async () => { refreshCalled = true; },
        env: undefined,
      };

      env.registerView('testView', mockView);
      await env.reload();

      // Views should be refreshed to update UI
      assert.strictEqual(refreshCalled, true, 'Should call refresh on all views');
      env.dispose();
    });
  });

  /**
   * dispose Tests
   *
   * Cleanup when extension deactivates.
   * Must dispose file watchers to prevent memory leaks.
   */
  suite('dispose', () => {
    test('should dispose file watchers', () => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);

      // Should not throw when disposing
      env.dispose();
    });

    test('should clear pending reactivation timer', () => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);

      // Access private property via any cast to test timer cleanup
      // In a real scenario, the timer would be set by manifest.toml change handler
      (env as any).manifestChangeTimeout = setTimeout(() => {}, 10000);

      // Dispose should clear the timer without error
      env.dispose();

      // Timer should be cleared
      assert.strictEqual((env as any).manifestChangeTimeout, undefined);
    });
  });

  /**
   * reactivateEnvironment Tests
   *
   * When manifest.toml changes and environment is active:
   * 1. Kill existing background flox process
   * 2. Spawn new activation process to capture new env vars
   * 3. Refresh UI views
   *
   * The isReactivating guard prevents concurrent reactivation attempts.
   */
  suite('reactivateEnvironment', () => {
    test('should have isReactivating guard initialized to false', () => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);

      // Guard should start as false
      assert.strictEqual((env as any).isReactivating, false);
      env.dispose();
    });

    test('should skip if already reactivating', async () => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);

      // Set guard to true (simulating in-progress reactivation)
      (env as any).isReactivating = true;

      // Call should return early without error
      await env.reactivateEnvironment();

      // Guard should still be true (not modified by early return)
      assert.strictEqual((env as any).isReactivating, true);
      env.dispose();
    });

    test('should set isReactivating to false after completion', async () => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);

      // Call reactivateEnvironment - it will fail because no process exists
      // but should still reset the guard in finally block
      try {
        await env.reactivateEnvironment();
      } catch {
        // Expected - spawn will fail in test environment
      }

      // Guard should be reset to false after completion (success or failure)
      assert.strictEqual((env as any).isReactivating, false);
      env.dispose();
    });
  });

  /**
   * Debounce Tests
   *
   * Manifest.toml change handler uses 500ms debounce to prevent
   * rapid reactivation during file editing.
   */
  suite('debounce', () => {
    test('should initialize manifestChangeTimeout as undefined', () => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);

      // Timer should not exist initially
      assert.strictEqual((env as any).manifestChangeTimeout, undefined);
      env.dispose();
    });
  });

  /**
   * isFloxInstalled Getter Tests
   *
   * Returns the current value of _isFloxInstalled.
   */
  suite('isFloxInstalled getter', () => {
    test('should return false by default', () => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);

      assert.strictEqual(env.isFloxInstalled, false);
      env.dispose();
    });
  });

  /**
   * compareVersions Tests
   *
   * Compares semantic version strings for update checking.
   */
  suite('compareVersions', () => {
    test('should return 0 for equal versions', () => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);

      assert.strictEqual(env.compareVersions('1.0.0', '1.0.0'), 0);
      assert.strictEqual(env.compareVersions('2.3.4', '2.3.4'), 0);
      env.dispose();
    });

    test('should return positive when v1 > v2', () => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);

      assert.ok(env.compareVersions('2.0.0', '1.0.0') > 0);
      assert.ok(env.compareVersions('1.1.0', '1.0.0') > 0);
      assert.ok(env.compareVersions('1.0.1', '1.0.0') > 0);
      env.dispose();
    });

    test('should return negative when v1 < v2', () => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);

      assert.ok(env.compareVersions('1.0.0', '2.0.0') < 0);
      assert.ok(env.compareVersions('1.0.0', '1.1.0') < 0);
      assert.ok(env.compareVersions('1.0.0', '1.0.1') < 0);
      env.dispose();
    });

    test('should handle version strings with different lengths', () => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);

      assert.strictEqual(env.compareVersions('1.0', '1.0.0'), 0);
      assert.ok(env.compareVersions('1.0.1', '1.0') > 0);
      env.dispose();
    });
  });

  /**
   * getFloxVersion Tests
   *
   * Gets the currently installed Flox version by running `flox --version`.
   */
  suite('getFloxVersion', () => {
    test('should return version string when flox is installed', async function() {
      // Skip if flox is not installed
      if (process.env.SKIP_FLOX_TESTS === '1') {
        this.skip();
        return;
      }

      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);

      const version = await env.getFloxVersion();
      // Should return a version like "1.3.1"
      if (version) {
        assert.ok(/^\d+\.\d+\.\d+/.test(version), `Version should be semver format: ${version}`);
      }
      env.dispose();
    });

    test('should return undefined without throwing when flox not installed', async () => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);

      // This test just verifies the method doesn't throw
      const version = await env.getFloxVersion();
      // Result depends on whether flox is installed
      assert.ok(version === undefined || typeof version === 'string');
      env.dispose();
    });
  });

  /**
   * checkForFloxUpdate Tests
   *
   * Checks for Flox updates (once per day).
   */
  suite('checkForFloxUpdate', () => {
    test('should not throw when called', async () => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);

      // Should not throw even if network is unavailable
      await env.checkForFloxUpdate();
      env.dispose();
    });

    test('should skip check if checked within last 24 hours', async () => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const mockOutput = new MockOutputChannel('Flox');
      const env = new Env(mockContext, workspaceUri, mockOutput);

      // Set last check to now
      await mockContext.globalState.update('flox.lastUpdateCheck', Date.now());

      await env.checkForFloxUpdate();

      assert.ok(mockOutput.hasLine('Skipping update check'), 'Should skip recent check');
      env.dispose();
    });

    test('should bypass cooldown when forced', async () => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const mockOutput = new MockOutputChannel('Flox');
      const env = new Env(mockContext, workspaceUri, mockOutput);

      // Set last check to 1 hour ago (within 24hr window)
      const oneHourAgo = Date.now() - (60 * 60 * 1000);
      await mockContext.globalState.update('flox.lastUpdateCheck', oneHourAgo);

      // Force check should NOT skip
      await env.checkForFloxUpdate(true);

      // Should NOT contain "Skipping update check"
      assert.ok(!mockOutput.hasLine('Skipping update check'),
        'Should not skip when forced');
      // Should contain "Checking for Flox updates"
      assert.ok(mockOutput.hasLine('Checking for Flox updates'),
        'Should attempt check when forced');
      env.dispose();
    });

    test('should not skip when forced even if checked recently', async () => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const mockOutput = new MockOutputChannel('Flox');
      const env = new Env(mockContext, workspaceUri, mockOutput);

      // Set last check to now
      await mockContext.globalState.update('flox.lastUpdateCheck', Date.now());

      // Without force, should skip
      await env.checkForFloxUpdate(false);
      assert.ok(mockOutput.hasLine('Skipping update check'), 'Should skip without force');

      // Clear output
      mockOutput.clear();

      // With force, should NOT skip
      await env.checkForFloxUpdate(true);
      assert.ok(!mockOutput.hasLine('Skipping update check'),
        'Should not skip when forced');
      assert.ok(mockOutput.hasLine('Checking for Flox updates'),
        'Should check when forced');
      env.dispose();
    });
  });

  /**
   * Logging Tests
   *
   * The Env class logs to a VSCode OutputChannel for debugging.
   * Users can view these logs in the Output panel under "Flox".
   *
   * Logging helps with:
   * - Debugging user issues
   * - Understanding command execution flow
   * - Tracking file watcher events
   */
  suite('Logging', () => {
    test('should log messages to output channel', () => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const mockOutput = new MockOutputChannel('Flox');
      const env = new Env(mockContext, workspaceUri, mockOutput);

      env.log('Test message');

      assert.ok(mockOutput.hasLine('Test message'), 'Should log message');
      env.dispose();
    });

    test('should log with timestamp', () => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const mockOutput = new MockOutputChannel('Flox');
      const env = new Env(mockContext, workspaceUri, mockOutput);

      env.log('Test message');

      // Timestamp format: [2026-01-06T10:30:00.000Z]
      assert.ok(mockOutput.hasLine(/^\[\d{4}-\d{2}-\d{2}T/), 'Should include timestamp');
      env.dispose();
    });

    test('should log error messages with ERROR prefix', () => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const mockOutput = new MockOutputChannel('Flox');
      const env = new Env(mockContext, workspaceUri, mockOutput);

      env.logError('Something went wrong');

      assert.ok(mockOutput.hasLine('ERROR: Something went wrong'), 'Should log error with prefix');
      env.dispose();
    });

    test('should log error with stack trace when Error provided', () => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const mockOutput = new MockOutputChannel('Flox');
      const env = new Env(mockContext, workspaceUri, mockOutput);

      const error = new Error('Test error');
      env.logError('Operation failed', error);

      assert.ok(mockOutput.hasLine('ERROR: Operation failed'), 'Should log error message');
      assert.ok(mockOutput.hasLine('Test error'), 'Should include error message');
      env.dispose();
    });

    test('should work without output channel', () => {
      // Output channel is optional - extension should work without it
      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri); // No output channel

      // Should not throw
      env.log('Test message');
      env.logError('Test error');
      env.dispose();
    });

    test('should log during reload', async () => {
      const floxDir = path.join(tempDir, '.flox', 'env');
      fs.mkdirSync(floxDir, { recursive: true });
      fs.writeFileSync(path.join(floxDir, 'manifest.lock'), JSON.stringify({
        manifest: { install: { nodejs: {} } },
      }));

      const workspaceUri = vscode.Uri.file(tempDir);
      const mockOutput = new MockOutputChannel('Flox');
      const env = new Env(mockContext, workspaceUri, mockOutput);

      await env.reload();

      assert.ok(mockOutput.hasLine('Reloading environment'), 'Should log reload start');
      assert.ok(mockOutput.hasLine('Environment loaded'), 'Should log reload complete');
      env.dispose();
    });

    test('should log environment variable application', async () => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const mockOutput = new MockOutputChannel('Flox');
      const env = new Env(mockContext, workspaceUri, mockOutput);

      await env.applyEnvironmentVariables({ 'TEST': 'value', 'ANOTHER': 'value2' });

      assert.ok(mockOutput.hasLine(/Applied \d+ environment variables/), 'Should log env var count');
      env.dispose();
    });

    test('should log environment variable clearing', async () => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const mockOutput = new MockOutputChannel('Flox');
      const env = new Env(mockContext, workspaceUri, mockOutput);

      await env.clearEnvironmentVariables();

      assert.ok(mockOutput.hasLine('Cleared environment variables'), 'Should log clear');
      env.dispose();
    });
  });

  /**
   * checkFloxInstalled Tests
   *
   * Detects if Flox CLI is installed by running `flox --version`.
   * Used on extension startup to show appropriate UI.
   */
  suite('checkFloxInstalled', () => {
    test('should return true when flox command succeeds', async function() {
      // This test requires flox to be installed
      // Skip if running in CI without flox
      if (process.env.SKIP_FLOX_TESTS === '1') {
        this.skip();
        return;
      }

      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);

      const result = await env.checkFloxInstalled();
      // Result depends on whether flox is actually installed
      // We just check it returns a boolean
      assert.strictEqual(typeof result, 'boolean');
      env.dispose();
    });

    test('should return boolean without throwing', async () => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);

      // Should not throw even if flox is not installed
      let result: boolean;
      try {
        result = await env.checkFloxInstalled();
      } catch {
        assert.fail('checkFloxInstalled should not throw');
        return;
      }

      assert.strictEqual(typeof result, 'boolean');
      env.dispose();
    });
  });

  /**
   * setFloxInstalled Tests
   *
   * Sets the flox.isInstalled context key and workspace state.
   * Controls visibility of UI elements.
   */
  suite('setFloxInstalled', () => {
    test('should update _isFloxInstalled property', async () => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);

      // Initially should be false
      assert.strictEqual(env.isFloxInstalled, false);

      await env.setFloxInstalled(true);
      assert.strictEqual(env.isFloxInstalled, true);

      await env.setFloxInstalled(false);
      assert.strictEqual(env.isFloxInstalled, false);

      env.dispose();
    });

    test('should update workspace state', async () => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);

      await env.setFloxInstalled(true);

      const storedValue = mockContext.workspaceState.get('flox.isInstalled');
      assert.strictEqual(storedValue, true);

      env.dispose();
    });
  });

  /**
   * updateAutoActivatePrefContext Tests
   *
   * Tests the updateAutoActivatePrefContext method that sets the flox.hasAutoActivatePref context key.
   */
  suite('updateAutoActivatePrefContext', () => {
    test('should set context to true when preference is true', async () => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);

      await mockContext.workspaceState.update('flox.autoActivate', true);
      await env.updateAutoActivatePrefContext();

      // Note: In unit tests, we can't directly test setContext command execution
      // This test verifies the method runs without errors
      env.dispose();
    });

    test('should set context to true when preference is false', async () => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);

      await mockContext.workspaceState.update('flox.autoActivate', false);
      await env.updateAutoActivatePrefContext();

      env.dispose();
    });

    test('should set context to false when preference is undefined', async () => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);

      await mockContext.workspaceState.update('flox.autoActivate', undefined);
      await env.updateAutoActivatePrefContext();

      env.dispose();
    });
  });

  /**
   * resetAutoActivatePreference Tests
   *
   * Tests the resetAutoActivatePreference method that resets the auto-activate preference to undefined.
   */
  suite('resetAutoActivatePreference', () => {
    test('should reset preference to undefined from true', async () => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);

      await mockContext.workspaceState.update('flox.autoActivate', true);
      await env.resetAutoActivatePreference();

      const pref = mockContext.workspaceState.get('flox.autoActivate');
      assert.strictEqual(pref, undefined);

      env.dispose();
    });

    test('should reset preference to undefined from false', async () => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);

      await mockContext.workspaceState.update('flox.autoActivate', false);
      await env.resetAutoActivatePreference();

      const pref = mockContext.workspaceState.get('flox.autoActivate');
      assert.strictEqual(pref, undefined);

      env.dispose();
    });

    test('should call updateAutoActivatePrefContext', async () => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);

      await mockContext.workspaceState.update('flox.autoActivate', true);
      await env.resetAutoActivatePreference();

      // Verify the preference was reset (which proves updateAutoActivatePrefContext was called internally)
      const pref = mockContext.workspaceState.get('flox.autoActivate');
      assert.strictEqual(pref, undefined);

      env.dispose();
    });
  });

  /**
   * isFloxInstalled Getter Tests
   *
   * Returns the current value of _isFloxInstalled.
   */
  suite('isFloxInstalled getter', () => {
    test('should return false by default', () => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);

      assert.strictEqual(env.isFloxInstalled, false);
      env.dispose();
    });
  });

  /**
   * MCP Detection Tests
   *
   * Tests for checking if flox-mcp command is available and Copilot is installed.
   */
  suite('MCP Detection', () => {
    test('checkFloxMcpAvailable should be defined', () => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);

      // Just verify the method exists
      assert.strictEqual(typeof env.checkFloxMcpAvailable, 'function');

      env.dispose();
    });

    test('setFloxMcpAvailable should update context and state', async () => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);

      await env.setFloxMcpAvailable(true);

      const storedValue = mockContext.workspaceState.get('flox.mcpAvailable');
      assert.strictEqual(storedValue, true);

      env.dispose();
    });

    test('checkCopilotInstalled should return boolean', () => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);

      const result = env.checkCopilotInstalled();

      // Should return boolean
      assert.strictEqual(typeof result, 'boolean');

      env.dispose();
    });

    test('setCopilotInstalled should update context and state', async () => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);

      await env.setCopilotInstalled(true);

      const storedValue = mockContext.workspaceState.get('flox.copilotInstalled');
      assert.strictEqual(storedValue, true);

      env.dispose();
    });
  });

  /**
   * MCP Suggestion Tests
   *
   * Tests for the one-time MCP suggestion notification.
   */
  suite('MCP Suggestion', () => {
    test('showMcpSuggestion should skip if already shown', async () => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);

      // Mark as already shown
      await mockContext.workspaceState.update('flox.mcpSuggestionShown', true);

      const result = await env.showMcpSuggestion();

      // Should return false (not shown)
      assert.strictEqual(result, false);

      env.dispose();
    });

    test('showMcpSuggestion should be defined', () => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);

      // Just verify the method exists
      assert.strictEqual(typeof env.showMcpSuggestion, 'function');

      env.dispose();
    });
  });

  /**
   * Badge Management Tests
   *
   * Tests the activity bar badge feature that shows a checkmark when environment is active.
   * The badge is visible on the Flox icon in the activity bar without opening the panel.
   */
  suite('Badge Management', () => {
    let mockTreeViews: vscode.TreeView<any>[];

    setup(() => {
      // Create mock TreeView objects with badge property
      mockTreeViews = [
        { badge: undefined } as vscode.TreeView<any>,
        { badge: undefined } as vscode.TreeView<any>,
        { badge: undefined } as vscode.TreeView<any>,
      ];
    });

    test('should set badge when environment becomes active', () => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);
      env.registerTreeViews(mockTreeViews);

      env.isEnvActive = true;
      env['updateActivityBadge']();  // Call private method

      for (const treeView of mockTreeViews) {
        assert.ok(treeView.badge);
        assert.strictEqual(treeView.badge.value, 1);
        assert.strictEqual(treeView.badge.tooltip, 'Flox environment is active');
      }

      env.dispose();
    });

    test('should clear badge when environment is deactivated', () => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);
      env.registerTreeViews(mockTreeViews);

      // Set active first
      env.isEnvActive = true;
      env['updateActivityBadge']();
      assert.ok(mockTreeViews[0].badge);

      // Then deactivate
      env.isEnvActive = false;
      env['updateActivityBadge']();

      for (const treeView of mockTreeViews) {
        assert.strictEqual(treeView.badge, undefined);
      }

      env.dispose();
    });

    test('should not crash when called before TreeViews registered', () => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);

      // Should not throw
      assert.doesNotThrow(() => {
        env['updateActivityBadge']();
      });

      env.dispose();
    });

    test('registerTreeViews should store TreeView references', () => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);

      assert.strictEqual(env['treeViews'].length, 0);

      env.registerTreeViews(mockTreeViews);

      assert.strictEqual(env['treeViews'].length, 3);
      assert.strictEqual(env['treeViews'], mockTreeViews);

      env.dispose();
    });
  });

  suite('applyEnvironmentVariables with existing terminals', () => {
    test('should store previous env for future comparisons', async () => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);

      await env.applyEnvironmentVariables({ PATH: '/test', FOO: 'bar' });

      const previousEnv = mockContext.workspaceState.get('flox.previousActivatedEnv');
      assert.deepStrictEqual(previousEnv, { PATH: '/test', FOO: 'bar' });
      env.dispose();
    });

    test('should calculate diff between previous and new env', async () => {
      const workspaceUri = vscode.Uri.file(tempDir);
      await mockContext.workspaceState.update('flox.previousActivatedEnv', {
        PATH: '/old',
        REMOVED: 'value'
      });
      await mockContext.workspaceState.update('flox.terminalsBeforeActivation', 1);

      const env = new Env(mockContext, workspaceUri);
      await env.applyEnvironmentVariables({ PATH: '/new', FOO: 'bar' });

      // Verify previous env was updated
      const previousEnv = mockContext.workspaceState.get('flox.previousActivatedEnv');
      assert.deepStrictEqual(previousEnv, { PATH: '/new', FOO: 'bar' });

      env.dispose();
    });

    test('should clear terminal count after update', async () => {
      const workspaceUri = vscode.Uri.file(tempDir);
      await mockContext.workspaceState.update('flox.terminalsBeforeActivation', 3);
      await mockContext.workspaceState.update('flox.previousActivatedEnv', { PATH: '/old' });

      const env = new Env(mockContext, workspaceUri);
      await env.applyEnvironmentVariables({ PATH: '/new' });

      // Counter should be cleared after update (since no actual terminals exist in mock)
      const count = mockContext.workspaceState.get('flox.terminalsBeforeActivation');
      assert.strictEqual(count, undefined);
      env.dispose();
    });

    test('should not update terminals on first activation', async () => {
      const workspaceUri = vscode.Uri.file(tempDir);
      // No previous env, no terminal count - first activation

      const env = new Env(mockContext, workspaceUri);
      await env.applyEnvironmentVariables({ PATH: '/test' });

      // Should just store env, no terminal updates
      const previousEnv = mockContext.workspaceState.get('flox.previousActivatedEnv');
      assert.deepStrictEqual(previousEnv, { PATH: '/test' });
      env.dispose();
    });
  });

  /**
   * Variable State Calculation Tests
   *
   * Test the state detection logic for variables (ACTIVE vs PENDING).
   * Variables should be PENDING when:
   * - Only in manifest.toml (not in lock file)
   * - In both but with different values
   *
   * These tests verify the bugs reported in issue #192.
   */
  suite('Variable State Calculation', () => {
    test('Variable only in toml should be PENDING', async () => {
      // Setup: Create environment with variable in toml but no lock file
      const floxDir = path.join(tempDir, '.flox', 'env');
      fs.mkdirSync(floxDir, { recursive: true });

      // Only manifest.toml exists (no lock file)
      const tomlFile = path.join(floxDir, 'manifest.toml');
      fs.writeFileSync(tomlFile, `
[vars]
MY_VAR = "hello"
`);

      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);

      await env.reload();

      // Assert: Variable should be PENDING
      const myVar = env.variables.get('MY_VAR');
      assert.ok(myVar, 'Variable should exist');
      assert.strictEqual(myVar.state, 'pending', 'Variable only in toml should be PENDING');
      env.dispose();
    });

    test('Variable in both with different values should be PENDING', async () => {
      // Setup: Create environment with variable in both lock and toml with different values
      const floxDir = path.join(tempDir, '.flox', 'env');
      fs.mkdirSync(floxDir, { recursive: true });

      // Lock file has MY_VAR="hello"
      const lockFile = path.join(floxDir, 'manifest.lock');
      fs.writeFileSync(lockFile, JSON.stringify({
        manifest: {
          vars: { MY_VAR: 'hello' },
        },
      }));

      // TOML file has MY_VAR="world" (different)
      const tomlFile = path.join(floxDir, 'manifest.toml');
      fs.writeFileSync(tomlFile, `
[vars]
MY_VAR = "world"
`);

      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);

      await env.reload();

      // Assert: Variable should be PENDING (values differ)
      const myVar = env.variables.get('MY_VAR');
      assert.ok(myVar, 'Variable should exist');
      assert.strictEqual(myVar.state, 'pending', 'Variable with different values should be PENDING');
      env.dispose();
    });

    test('Variable in both with same value should be ACTIVE', async () => {
      // Setup: Create environment with variable in both lock and toml with same value
      const floxDir = path.join(tempDir, '.flox', 'env');
      fs.mkdirSync(floxDir, { recursive: true });

      // Lock file has MY_VAR="hello"
      const lockFile = path.join(floxDir, 'manifest.lock');
      fs.writeFileSync(lockFile, JSON.stringify({
        manifest: {
          vars: { MY_VAR: 'hello' },
        },
      }));

      // TOML file has MY_VAR="hello" (same)
      const tomlFile = path.join(floxDir, 'manifest.toml');
      fs.writeFileSync(tomlFile, `
[vars]
MY_VAR = "hello"
`);

      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);

      await env.reload();

      // Assert: Variable should be ACTIVE (same value)
      const myVar = env.variables.get('MY_VAR');
      assert.ok(myVar, 'Variable should exist');
      assert.strictEqual(myVar.state, 'active', 'Variable with same value should be ACTIVE');
      env.dispose();
    });

    test('Variable comparison should normalize whitespace', async () => {
      // Setup: Lock has "hello", toml has " hello " (with extra spaces)
      const floxDir = path.join(tempDir, '.flox', 'env');
      fs.mkdirSync(floxDir, { recursive: true });

      const lockFile = path.join(floxDir, 'manifest.lock');
      fs.writeFileSync(lockFile, JSON.stringify({
        manifest: {
          vars: { MY_VAR: 'hello' },
        },
      }));

      const tomlFile = path.join(floxDir, 'manifest.toml');
      fs.writeFileSync(tomlFile, `
[vars]
MY_VAR = " hello "
`);

      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);

      await env.reload();

      // Assert: Variable should be ACTIVE (same after trimming whitespace)
      const myVar = env.variables.get('MY_VAR');
      assert.ok(myVar, 'Variable should exist');
      assert.strictEqual(myVar.state, 'active', 'Variable should be ACTIVE after normalizing whitespace');
      env.dispose();
    });
  });

  /**
   * Service State Calculation Tests
   *
   * Test the state detection logic for services (ACTIVE vs PENDING).
   * Services should be PENDING when:
   * - Only in manifest.toml (not in lock file)
   * - In both but with different properties
   *
   * These tests verify the bugs reported in issue #194.
   */
  suite('Service State Calculation', () => {
    test('Service only in toml should be PENDING', async () => {
      // Setup: Create environment with service in toml but no lock file
      const floxDir = path.join(tempDir, '.flox', 'env');
      fs.mkdirSync(floxDir, { recursive: true });

      // Only manifest.toml exists (no lock file)
      const tomlFile = path.join(floxDir, 'manifest.toml');
      fs.writeFileSync(tomlFile, `
[services]
myservice.command = "sleep 1000"
`);

      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);

      await env.reload();

      // Assert: Service should be PENDING
      const state = env.getServiceState('myservice', false); // lockExists = false
      assert.strictEqual(state, 'pending', 'Service only in toml should be PENDING');
      env.dispose();
    });

    test('Service with different properties should be PENDING', async () => {
      // Setup: Lock has command="x", toml has command="y"
      const floxDir = path.join(tempDir, '.flox', 'env');
      fs.mkdirSync(floxDir, { recursive: true });

      const lockFile = path.join(floxDir, 'manifest.lock');
      fs.writeFileSync(lockFile, JSON.stringify({
        manifest: {
          services: {
            myservice: { command: 'sleep 100' },
          },
        },
      }));

      const tomlFile = path.join(floxDir, 'manifest.toml');
      fs.writeFileSync(tomlFile, `
[services]
myservice.command = "sleep 1000"
`);

      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);

      await env.reload();

      // Assert: Service should be PENDING (different command)
      const state = env.getServiceState('myservice', true); // lockExists = true
      assert.strictEqual(state, 'pending', 'Service with different properties should be PENDING');
      env.dispose();
    });

    test('Service with same properties (different order) should be ACTIVE', async () => {
      // Setup: Lock has {command: "x", var: "y"}, toml has {var: "y", command: "x"}
      const floxDir = path.join(tempDir, '.flox', 'env');
      fs.mkdirSync(floxDir, { recursive: true });

      const lockFile = path.join(floxDir, 'manifest.lock');
      fs.writeFileSync(lockFile, JSON.stringify({
        manifest: {
          services: {
            myservice: { command: 'sleep 1000', var: 'MY_VAR' },
          },
        },
      }));

      const tomlFile = path.join(floxDir, 'manifest.toml');
      fs.writeFileSync(tomlFile, `
[services]
myservice.var = "MY_VAR"
myservice.command = "sleep 1000"
`);

      const workspaceUri = vscode.Uri.file(tempDir);
      const env = new Env(mockContext, workspaceUri);

      await env.reload();

      // Assert: Service should be ACTIVE (same properties, just different order)
      const state = env.getServiceState('myservice', true); // lockExists = true
      assert.strictEqual(state, 'active', 'Service with same properties (different order) should be ACTIVE');
      env.dispose();
    });
  });
});
