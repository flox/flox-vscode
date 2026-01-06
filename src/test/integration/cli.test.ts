/**
 * Flox CLI Integration Tests
 *
 * These tests verify the Flox CLI operations directly (not through VSCode commands):
 * 1. Initialize a new Flox environment
 * 2. Install packages
 * 3. Activate the environment
 * 4. Test manifest.toml changes
 *
 * Requirements:
 * - Flox CLI must be installed
 * - Tests create temporary directories for isolation
 * - Set SKIP_FLOX_TESTS=1 to skip these tests in CI without Flox
 *
 * Note: For end-to-end VSCode command tests, see happy_path.test.ts
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync } from 'child_process';

suite('Flox CLI Integration Tests', function() {
  // These tests can be slow - set generous timeout
  this.timeout(120000);

  let tempDir: string;
  let originalWorkspaceFolders: readonly vscode.WorkspaceFolder[] | undefined;

  // Skip entire suite if SKIP_FLOX_TESTS is set or flox is not installed
  suiteSetup(function() {
    if (process.env.SKIP_FLOX_TESTS === '1') {
      this.skip();
      return;
    }

    // Check if flox is installed
    try {
      execSync('flox --version', { stdio: 'pipe' });
    } catch {
      console.log('Flox CLI not found, skipping happy path tests');
      this.skip();
      return;
    }
  });

  setup(async function() {
    // Create a fresh temp directory for each test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flox-happy-path-'));
    originalWorkspaceFolders = vscode.workspace.workspaceFolders;
  });

  teardown(async function() {
    // Clean up temp directory
    if (tempDir && fs.existsSync(tempDir)) {
      // Deactivate any running flox environment first
      try {
        execSync('flox delete --force', { cwd: tempDir, stdio: 'pipe' });
      } catch {
        // Ignore errors - env might not exist
      }
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  /**
   * Helper to run flox command in temp directory
   */
  function flox(args: string): string {
    return execSync(`flox ${args}`, {
      cwd: tempDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });
  }

  suite('Environment Initialization', function() {
    test('flox init creates environment files', async function() {
      // Run flox init
      flox('init');

      // Verify .flox directory was created
      const floxDir = path.join(tempDir, '.flox');
      assert.ok(fs.existsSync(floxDir), '.flox directory should exist');

      // Verify manifest.toml exists
      const manifestPath = path.join(floxDir, 'env', 'manifest.toml');
      assert.ok(fs.existsSync(manifestPath), 'manifest.toml should exist');

      // Verify manifest has expected structure
      const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
      assert.ok(manifestContent.includes('[install]'), 'manifest should have [install] section');
    });

    test('flox init with name creates named environment', async function() {
      flox('init --name test-env');

      const floxDir = path.join(tempDir, '.flox');
      assert.ok(fs.existsSync(floxDir), '.flox directory should exist');
    });
  });

  suite('Package Installation', function() {
    setup(function() {
      // Each test in this suite needs an initialized environment
      flox('init');
    });

    test('flox install adds package to manifest', async function() {
      // Install a small, common package
      flox('install hello');

      // Verify package is in manifest.lock
      const lockPath = path.join(tempDir, '.flox', 'env', 'manifest.lock');
      assert.ok(fs.existsSync(lockPath), 'manifest.lock should exist after install');

      const lockContent = fs.readFileSync(lockPath, 'utf-8');
      const lock = JSON.parse(lockContent);

      // Check package is in the lock file
      assert.ok(lock.packages, 'lock should have packages array');
      const helloPackage = lock.packages.find((p: any) => p.install_id === 'hello');
      assert.ok(helloPackage, 'hello package should be in lock file');
    });

    test('flox uninstall removes package from manifest', async function() {
      // Install then uninstall
      flox('install hello');
      flox('uninstall hello');

      // Check manifest.toml no longer has the package
      const manifestPath = path.join(tempDir, '.flox', 'env', 'manifest.toml');
      const manifestContent = fs.readFileSync(manifestPath, 'utf-8');

      // After uninstall, hello should not be in install section
      assert.ok(!manifestContent.includes('hello'), 'hello should be removed from manifest');
    });

    test('flox install multiple packages', async function() {
      // Install multiple packages at once
      flox('install hello jq');

      const lockPath = path.join(tempDir, '.flox', 'env', 'manifest.lock');
      const lockContent = fs.readFileSync(lockPath, 'utf-8');
      const lock = JSON.parse(lockContent);

      const helloPackage = lock.packages.find((p: any) => p.install_id === 'hello');
      const jqPackage = lock.packages.find((p: any) => p.install_id === 'jq');

      assert.ok(helloPackage, 'hello package should be installed');
      assert.ok(jqPackage, 'jq package should be installed');
    });
  });

  suite('Environment Activation', function() {
    setup(function() {
      flox('init');
      flox('install hello');
    });

    test('flox activate sets environment variables', async function() {
      // Run a command in the activated environment
      const result = flox('activate -- hello --version');

      // hello --version should produce output (proves it's available in PATH)
      assert.ok(result.length > 0, 'hello command should produce output');
    });

    test('flox activate -- command runs in environment', async function() {
      // Run hello in the activated environment
      const result = flox('activate -- hello');

      // hello outputs "Hello, world!"
      assert.ok(result.includes('Hello'), 'hello output should contain greeting');
    });
  });

  suite('Environment Variables', function() {
    setup(function() {
      flox('init');
    });

    test('custom variables are set in environment', async function() {
      // Add a custom variable to manifest
      const manifestPath = path.join(tempDir, '.flox', 'env', 'manifest.toml');
      let manifest = fs.readFileSync(manifestPath, 'utf-8');

      // Check if [vars] section already exists
      if (manifest.includes('[vars]')) {
        // Add variable under existing [vars] section
        manifest = manifest.replace('[vars]', '[vars]\nMY_TEST_VAR = "test_value_123"');
      } else {
        // Add new [vars] section at the end
        manifest += '\n[vars]\nMY_TEST_VAR = "test_value_123"\n';
      }
      fs.writeFileSync(manifestPath, manifest);

      // Verify variable is available in activated environment
      const result = flox('activate -- printenv MY_TEST_VAR');
      assert.ok(result.trim() === 'test_value_123', 'Custom variable should be set');
    });
  });

  suite('Manifest Changes', function() {
    setup(function() {
      flox('init');
    });

    test('editing manifest.toml and running activate picks up changes', async function() {
      // Add a package directly to manifest using proper TOML format
      const manifestPath = path.join(tempDir, '.flox', 'env', 'manifest.toml');
      let manifest = fs.readFileSync(manifestPath, 'utf-8');

      // Find [install] section and add package with proper pkg-path format
      // Flox requires either a catalog descriptor or explicit pkg-path
      if (manifest.includes('[install]')) {
        manifest = manifest.replace(/\[install\]\s*\n/, '[install]\nhello.pkg-path = "hello"\n');
      } else {
        manifest += '\n[install]\nhello.pkg-path = "hello"\n';
      }
      fs.writeFileSync(manifestPath, manifest);

      // Activate to resolve the package
      const result = flox('activate -- hello');

      // Should work - package was resolved
      assert.ok(result.includes('Hello'), 'Package added via manifest edit should work after activate');
    });

    test('manifest.lock is updated when manifest.toml changes', async function() {
      // Initially no lock file or empty packages
      flox('activate -- true'); // Just activate to create lock

      const lockPath = path.join(tempDir, '.flox', 'env', 'manifest.lock');
      const initialLock = fs.readFileSync(lockPath, 'utf-8');
      const initialPackages = JSON.parse(initialLock).packages || [];

      // Install a package
      flox('install hello');

      // Lock should now have the package
      const updatedLock = fs.readFileSync(lockPath, 'utf-8');
      const updatedPackages = JSON.parse(updatedLock).packages || [];

      assert.ok(
        updatedPackages.length > initialPackages.length,
        'Lock file should have more packages after install'
      );
    });
  });

  suite('Services', function() {
    setup(function() {
      flox('init');
    });

    test('flox services status handles no services gracefully', async function() {
      // Services might not be configured - the command should either:
      // 1. Return valid JSON if services exist
      // 2. Exit with error "does not have any services defined" if none exist
      try {
        const result = execSync('flox services status --json', {
          cwd: tempDir,
          encoding: 'utf-8',
          stdio: 'pipe',
        });
        // If we get here, services exist and returned JSON
        JSON.parse(result);
        assert.ok(true, 'services status returns valid JSON');
      } catch (error: any) {
        // Check if the error is the expected "no services" error
        const errorOutput = error.stderr?.toString() || error.message || '';
        if (errorOutput.includes('does not have any services defined') ||
            errorOutput.includes('No services defined')) {
          // This is expected for an environment without services
          assert.ok(true, 'No services defined is acceptable');
        } else {
          // Re-throw unexpected errors
          throw error;
        }
      }
    });
  });

  suite('Search Functionality', function() {
    test('flox search returns results', async function() {
      // Search for a common package
      const result = flox('search nodejs --json');

      // Should return JSON array of results
      const results = JSON.parse(result);
      assert.ok(Array.isArray(results), 'Search should return array');
      assert.ok(results.length > 0, 'Search for nodejs should return results');

      // Each result should have expected fields
      const firstResult = results[0];
      assert.ok(firstResult.pname || firstResult.name, 'Result should have package name');
    });
  });

  suite('Full Workflow', function() {
    test('complete user journey: init -> install -> activate -> use', async function() {
      // Step 1: Initialize environment
      flox('init');
      assert.ok(
        fs.existsSync(path.join(tempDir, '.flox', 'env', 'manifest.toml')),
        'Step 1: Environment initialized'
      );

      // Step 2: Install a package
      flox('install hello');
      const lockContent = fs.readFileSync(
        path.join(tempDir, '.flox', 'env', 'manifest.lock'),
        'utf-8'
      );
      const lock = JSON.parse(lockContent);
      assert.ok(lock.packages?.length >= 1, 'Step 2: Package installed');

      // Step 3: Add custom environment variable
      const manifestPath = path.join(tempDir, '.flox', 'env', 'manifest.toml');
      let manifest = fs.readFileSync(manifestPath, 'utf-8');

      // Properly add vars section - check if it exists first
      if (manifest.includes('[vars]')) {
        manifest = manifest.replace('[vars]', '[vars]\nGREETING = "Hello from Flox!"');
      } else {
        manifest += '\n[vars]\nGREETING = "Hello from Flox!"\n';
      }
      fs.writeFileSync(manifestPath, manifest);

      // Step 4: Activate and verify everything works
      const helloResult = flox('activate -- hello');
      assert.ok(helloResult.includes('Hello'), 'Step 4a: hello command works');

      const envResult = flox('activate -- printenv GREETING');
      assert.ok(envResult.includes('Hello from Flox!'), 'Step 4b: Custom variable is set');
    });
  });
});
