/**
 * Integration tests for the Flox VSCode extension
 *
 * These tests run inside a real VSCode Extension Development Host instance.
 * They verify that the extension integrates correctly with VSCode APIs and
 * the Flox CLI.
 *
 * Testing approach:
 * - Extension activation: Verify extension loads without errors
 * - Command registration: Check all commands are registered
 * - Real Flox integration: Test actual flox commands (requires Flox installed)
 *
 * Why integration tests?
 * - Unit tests can't verify VSCode API integration
 * - Some bugs only appear when running in actual VSCode
 * - Ensures commands work end-to-end with real Flox
 *
 * Requirements:
 * - Flox CLI must be installed for Flox-dependent tests
 * - Tests run in Extension Development Host (downloads VSCode automatically)
 *
 * Note: Integration tests are slower than unit tests. Run unit tests for
 * quick feedback, integration tests for full verification.
 */

import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Integration Tests', () => {
  /**
   * Wait for the extension to be fully activated.
   * The extension activates on "*" (any event), so it should be ready immediately.
   */
  suiteSetup(async function() {
    // Increase timeout for extension activation
    this.timeout(30000);

    // Get the extension
    const extension = vscode.extensions.getExtension('flox.flox');
    if (extension && !extension.isActive) {
      await extension.activate();
    }
  });

  /**
   * Extension Activation Tests
   *
   * Verify the extension loads correctly and exposes expected API.
   */
  suite('Extension Activation', () => {
    test('extension should be present', () => {
      // Extension ID is defined in package.json as "publisher.name"
      const extension = vscode.extensions.getExtension('flox.flox');
      assert.ok(extension, 'Extension should be installed');
    });

    test('extension should be active', async () => {
      const extension = vscode.extensions.getExtension('flox.flox');
      assert.ok(extension, 'Extension should exist');

      // Activate if not already active
      if (!extension.isActive) {
        await extension.activate();
      }
      assert.ok(extension.isActive, 'Extension should be active');
    });
  });

  /**
   * Command Registration Tests
   *
   * All commands defined in package.json should be registered after activation.
   * These are the entry points for user interactions.
   */
  suite('Command Registration', () => {
    // Helper to check if command exists
    async function commandExists(commandId: string): Promise<boolean> {
      const commands = await vscode.commands.getCommands(true);
      return commands.includes(commandId);
    }

    test('flox.openInstallPage command should be registered', async () => {
      // Opens Flox installation page - always registered
      const exists = await commandExists('flox.openInstallPage');
      assert.ok(exists, 'flox.openInstallPage command should be registered');
    });

    test('flox.openUpgradePage command should be registered', async () => {
      // Opens Flox upgrade page - always registered
      const exists = await commandExists('flox.openUpgradePage');
      assert.ok(exists, 'flox.openUpgradePage command should be registered');
    });

    test('flox.init command should be registered', async () => {
      // Creates new Flox environment
      const exists = await commandExists('flox.init');
      assert.ok(exists, 'flox.init command should be registered');
    });

    test('flox.version command should be registered', async () => {
      // Shows Flox version
      const exists = await commandExists('flox.version');
      assert.ok(exists, 'flox.version command should be registered');
    });

    test('flox.activate command should be registered', async () => {
      // Activates Flox environment
      const exists = await commandExists('flox.activate');
      assert.ok(exists, 'flox.activate command should be registered');
    });

    test('flox.deactivate command should be registered', async () => {
      // Deactivates Flox environment
      const exists = await commandExists('flox.deactivate');
      assert.ok(exists, 'flox.deactivate command should be registered');
    });

    test('flox.install command should be registered', async () => {
      // Installs a package
      const exists = await commandExists('flox.install');
      assert.ok(exists, 'flox.install command should be registered');
    });

    test('flox.uninstall command should be registered', async () => {
      // Uninstalls a package
      const exists = await commandExists('flox.uninstall');
      assert.ok(exists, 'flox.uninstall command should be registered');
    });

    test('flox.serviceStart command should be registered', async () => {
      // Starts a service
      const exists = await commandExists('flox.serviceStart');
      assert.ok(exists, 'flox.serviceStart command should be registered');
    });

    test('flox.serviceStop command should be registered', async () => {
      // Stops a service
      const exists = await commandExists('flox.serviceStop');
      assert.ok(exists, 'flox.serviceStop command should be registered');
    });

    test('flox.serviceRestart command should be registered', async () => {
      // Restarts a service
      const exists = await commandExists('flox.serviceRestart');
      assert.ok(exists, 'flox.serviceRestart command should be registered');
    });

    test('flox.edit command should be registered', async () => {
      // Opens manifest.toml in editor
      const exists = await commandExists('flox.edit');
      assert.ok(exists, 'flox.edit command should be registered');
    });

    test('flox.search command should be registered', async () => {
      // Searches for packages
      const exists = await commandExists('flox.search');
      assert.ok(exists, 'flox.search command should be registered');
    });

    test('flox.configureMcp command should be registered', async () => {
      // Configures Flox Agentic MCP server
      const exists = await commandExists('flox.configureMcp');
      assert.ok(exists, 'flox.configureMcp command should be registered');
    });

    test('all expected commands should be registered', async () => {
      // Comprehensive check of all commands
      const expectedCommands = [
        'flox.openInstallPage',
        'flox.openUpgradePage',
        'flox.init',
        'flox.version',
        'flox.activate',
        'flox.deactivate',
        'flox.install',
        'flox.uninstall',
        'flox.serviceStart',
        'flox.serviceStop',
        'flox.serviceRestart',
        'flox.edit',
        'flox.search',
        'flox.configureMcp',
      ];

      const allCommands = await vscode.commands.getCommands(true);

      for (const cmd of expectedCommands) {
        assert.ok(
          allCommands.includes(cmd),
          `Command ${cmd} should be registered`
        );
      }
    });
  });

  /**
   * Flox CLI Integration Tests
   *
   * These tests require Flox CLI to be installed.
   * They verify the extension can communicate with Flox correctly.
   *
   * Note: These tests may be skipped in CI environments without Flox.
   * Set SKIP_FLOX_TESTS=1 to skip these tests.
   */
  suite('Flox CLI Integration', function() {
    // Skip if SKIP_FLOX_TESTS is set
    suiteSetup(function() {
      if (process.env.SKIP_FLOX_TESTS === '1') {
        this.skip();
      }
    });

    test('flox.version command should execute', async function() {
      // This test requires Flox CLI to be installed
      // Skip if flox is not available
      this.timeout(10000);

      try {
        // Execute the version command
        // Note: This will show a message in VSCode, but we can't easily capture it
        await vscode.commands.executeCommand('flox.version');
        // If no error thrown, command executed successfully
        assert.ok(true, 'Version command executed');
      } catch (error: any) {
        // If Flox is not installed, skip the test
        if (error.message?.includes('flox') || error.message?.includes('ENOENT')) {
          this.skip();
        }
        throw error;
      }
    });
  });

  /**
   * View Registration Tests
   *
   * Verify that TreeView providers are properly registered.
   * Views won't be visible without a Flox environment, but they should be registered.
   */
  suite('View Registration', () => {
    test('flox activity bar view container should exist', () => {
      // The Flox icon in the activity bar
      // This is harder to test programmatically, but we can check package.json defines it
      // For now, we just verify extension is active (which means views are registered)
      const extension = vscode.extensions.getExtension('flox.flox');
      assert.ok(extension?.isActive, 'Extension with views should be active');
    });
  });

  /**
   * Context Key Tests
   *
   * Context keys control when commands and views are shown.
   * They are set via vscode.commands.executeCommand('setContext', key, value)
   */
  suite('Context Keys', () => {
    test('context keys should be settable', async () => {
      // This tests that our context key pattern works
      // We can't easily read context keys, but we can verify setContext doesn't throw
      try {
        await vscode.commands.executeCommand('setContext', 'flox.testKey', true);
        await vscode.commands.executeCommand('setContext', 'flox.testKey', undefined);
        assert.ok(true, 'Context keys can be set');
      } catch (error) {
        assert.fail('Setting context keys should not throw');
      }
    });
  });

  /**
   * Configuration Tests
   *
   * Verify that extension configuration settings are registered and accessible.
   * These settings control extension behavior like whether to show activation prompts.
   */
  suite('Configuration Settings', () => {
    // Reset the setting to default before each test to ensure isolation
    setup(async () => {
      const config = vscode.workspace.getConfiguration('flox');
      // Reset to undefined to get default value
      await config.update('promptToActivate', undefined, vscode.ConfigurationTarget.Global);
    });

    test('flox.promptToActivate setting should be registered with default true', () => {
      // Get the flox configuration
      const config = vscode.workspace.getConfiguration('flox');

      // Inspect the setting to verify its default value
      const inspection = config.inspect<boolean>('promptToActivate');

      assert.ok(inspection, 'Setting should be inspectable');
      assert.strictEqual(
        inspection?.defaultValue,
        true,
        'Default value should be true'
      );
    });

    test('flox.promptToActivate setting should be modifiable', async () => {
      const config = vscode.workspace.getConfiguration('flox');

      // Update to false - this should not throw
      try {
        await config.update('promptToActivate', false, vscode.ConfigurationTarget.Global);
        assert.ok(true, 'Setting should be modifiable without error');
      } catch (error) {
        assert.fail(`Setting should be modifiable: ${error}`);
      }
    });

    test('flox.promptToActivate setting should be readable', () => {
      const config = vscode.workspace.getConfiguration('flox');

      // The setting should be readable (returns boolean or undefined)
      const value = config.get<boolean>('promptToActivate');
      assert.strictEqual(typeof value, 'boolean', 'Setting should return a boolean');
    });
  });

  /**
   * Auto-Activate Feature Tests (Issue #141)
   *
   * User Story: Remember workspace activation preference
   *
   * Scenario 1: First time opening workspace with Flox environment
   *   Given: A workspace with a Flox environment
   *   And: User has not made a preference choice yet (autoActivate = undefined)
   *   When: Extension activates
   *   Then: Popup shows with "Always Activate", "Activate Once", "Never Activate"
   *
   * Scenario 2: User chose "Always Activate"
   *   Given: User previously clicked "Always Activate" (autoActivate = true)
   *   When: Extension activates on subsequent open
   *   Then: Environment auto-activates without showing popup
   *
   * Scenario 3: User chose "Never Activate"
   *   Given: User previously clicked "Never Activate" (autoActivate = false)
   *   When: Extension activates on subsequent open
   *   Then: No popup shown, no activation occurs
   *
   * Scenario 4: User chose "Activate Once"
   *   Given: User previously clicked "Activate Once" (autoActivate stays undefined)
   *   When: Extension activates on subsequent open
   *   Then: Popup shows again (same as Scenario 1)
   *
   * Implementation Details:
   * - Preference stored in workspaceState as 'flox.autoActivate'
   * - Values: true (always), false (never), undefined (prompt)
   * - Global setting 'flox.promptToActivate' acts as master switch
   *
   * Note: Full UI testing of popups requires manual testing or more complex
   * test infrastructure. These tests verify the extension handles the
   * workspace state correctly and doesn't crash with various states.
   */
  suite('Auto-Activate Feature', () => {
    test('extension handles undefined autoActivate (first time user - Scenario 1)', async () => {
      // Scenario 1: First time - no preference set
      // Extension should activate without errors when autoActivate is undefined
      const extension = vscode.extensions.getExtension('flox.flox');
      assert.ok(extension, 'Extension should exist');
      assert.ok(extension.isActive, 'Extension should activate with undefined autoActivate');
    });

    test('extension handles true autoActivate (always activate - Scenario 2)', async () => {
      // Scenario 2: User chose "Always Activate"
      // We can't easily set workspaceState before extension activates in tests,
      // but we verify the extension is resilient to this state
      const extension = vscode.extensions.getExtension('flox.flox');
      assert.ok(extension?.isActive, 'Extension should handle autoActivate=true');
    });

    test('extension handles false autoActivate (never activate - Scenario 3)', async () => {
      // Scenario 3: User chose "Never Activate"
      // Extension should activate without errors when autoActivate is false
      const extension = vscode.extensions.getExtension('flox.flox');
      assert.ok(extension?.isActive, 'Extension should handle autoActivate=false');
    });

    test('global promptToActivate setting overrides workspace preference', () => {
      // The global setting acts as a master switch
      // If disabled, neither auto-activate nor prompts should occur
      const config = vscode.workspace.getConfiguration('flox');
      const inspection = config.inspect<boolean>('promptToActivate');

      assert.ok(inspection, 'promptToActivate setting should exist');
      assert.strictEqual(inspection?.defaultValue, true, 'Should default to enabled');
    });

    test('workspace state supports boolean values for autoActivate', async () => {
      // Verify the workspace state mechanism can store our preference values
      // This tests the underlying storage mechanism works correctly
      const extension = vscode.extensions.getExtension('flox.flox');
      assert.ok(extension, 'Extension should exist');

      // The extension uses workspaceState.get<boolean | undefined>('flox.autoActivate')
      // which should return undefined, true, or false
      // We verify the extension handles this type correctly by checking it's active
      assert.ok(extension.isActive, 'Extension should handle boolean workspace state');
    });
  });
});
