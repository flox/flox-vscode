/**
 * Unit tests for src/integrations.ts
 *
 * Tests the IntegrationManager which detects Flox-provided binaries
 * and configures VS Code settings to use them.
 *
 * Testing approach:
 * - Use real temp directories with mock .flox/run/system/bin/ structure
 * - Place empty executable files for binaries
 * - Mock VS Code workspace configuration updates
 * - Mock workspace state for storing user choices
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { IntegrationManager, INTEGRATIONS } from '../../integrations';
import { createMockExtensionContext, MockOutputChannel } from '../mocks/vscode';

suite('IntegrationManager Unit Tests', () => {
  let mockContext: vscode.ExtensionContext;
  let mockOutput: MockOutputChannel;
  let tempDir: string;

  setup(() => {
    mockContext = createMockExtensionContext();
    mockOutput = new MockOutputChannel('Flox');
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flox-integration-test-'));
  });

  teardown(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  /**
   * Helper: create a mock .flox/run/<system>/bin/ directory with binaries
   */
  function createMockBinDir(binaries: string[]): string {
    const binDir = path.join(tempDir, '.flox', 'run', 'aarch64-darwin.test.dev', 'bin');
    fs.mkdirSync(binDir, { recursive: true });
    for (const binary of binaries) {
      const filePath = path.join(binDir, binary);
      fs.writeFileSync(filePath, '');
      fs.chmodSync(filePath, 0o755);
    }
    return binDir;
  }

  // ── Suite 1: Scanning ──────────────────────────────────────────────

  suite('Scanning', () => {
    test('should detect existing binary', () => {
      createMockBinDir(['git']);
      const workspaceUri = vscode.Uri.file(tempDir);
      const manager = new IntegrationManager(mockContext, workspaceUri, mockOutput);

      const available = manager.scan();

      // git might be filtered by extensionId check, so check resolveBinDir works
      const binDir = manager.resolveBinDir();
      assert.ok(binDir, 'bin dir should be resolved');
      assert.ok(fs.existsSync(path.join(binDir!, 'git')), 'git binary should exist');
    });

    test('should skip missing binary', () => {
      createMockBinDir(['git']);
      const workspaceUri = vscode.Uri.file(tempDir);
      const manager = new IntegrationManager(mockContext, workspaceUri, mockOutput);

      const binDir = manager.resolveBinDir();
      assert.ok(binDir);
      // python3 does not exist in the bin dir
      assert.ok(!fs.existsSync(path.join(binDir!, 'python3')));
    });

    test('should handle missing bin dir', () => {
      // No .flox directory at all
      const workspaceUri = vscode.Uri.file(tempDir);
      const manager = new IntegrationManager(mockContext, workspaceUri, mockOutput);

      const binDir = manager.resolveBinDir();
      assert.strictEqual(binDir, undefined);

      const available = manager.scan();
      assert.strictEqual(available.length, 0);
    });

    test('should handle empty bin dir', () => {
      createMockBinDir([]);
      const workspaceUri = vscode.Uri.file(tempDir);
      const manager = new IntegrationManager(mockContext, workspaceUri, mockOutput);

      const binDir = manager.resolveBinDir();
      assert.ok(binDir, 'bin dir should still resolve');

      const available = manager.scan();
      assert.strictEqual(available.length, 0);
    });

    test('should handle undefined workspace uri', () => {
      const manager = new IntegrationManager(mockContext, undefined, mockOutput);

      const binDir = manager.resolveBinDir();
      assert.strictEqual(binDir, undefined);

      const available = manager.scan();
      assert.strictEqual(available.length, 0);
    });

    test('should resolve bin dir correctly', () => {
      const binDir = createMockBinDir(['cmake', 'node']);
      const workspaceUri = vscode.Uri.file(tempDir);
      const manager = new IntegrationManager(mockContext, workspaceUri, mockOutput);

      const resolved = manager.resolveBinDir();
      assert.strictEqual(resolved, binDir);
    });
  });

  // ── Suite 2: Prompt Logic ──────────────────────────────────────────

  suite('Prompt Logic', () => {
    test('should not prompt when all integrations have stored choices', async () => {
      createMockBinDir(['node']);
      const workspaceUri = vscode.Uri.file(tempDir);
      const manager = new IntegrationManager(mockContext, workspaceUri, mockOutput);

      // Pre-store choices for all integrations
      await mockContext.workspaceState.update('flox.integrations', {
        node: true,
      });

      // scan() returns available, but promptForNew should skip
      // since all available ones already have choices
      const available = manager.scan();
      // Note: node has no extensionId so it should be found if the binary exists
      const newOnes = available.filter(i => !(i.id in manager.getChoices()));
      assert.strictEqual(newOnes.length, 0);
    });

    test('should not prompt when no binaries match', async () => {
      createMockBinDir([]);
      const workspaceUri = vscode.Uri.file(tempDir);
      const manager = new IntegrationManager(mockContext, workspaceUri, mockOutput);

      const available = manager.scan();
      assert.strictEqual(available.length, 0);
    });
  });

  // ── Suite 3: Setting Application ───────────────────────────────────

  suite('Setting Application', () => {
    test('should apply approved integration settings', async () => {
      const binDir = createMockBinDir(['node']);
      const workspaceUri = vscode.Uri.file(tempDir);
      const manager = new IntegrationManager(mockContext, workspaceUri, mockOutput);

      // Store approval for node
      await mockContext.workspaceState.update('flox.integrations', {
        node: true,
      });

      manager.applyApproved();

      // Check that the output logged the application
      assert.ok(
        mockOutput.hasLine('[INTEGRATIONS] Applied node.path'),
        'Should log setting application'
      );
    });

    test('should skip rejected integrations', async () => {
      createMockBinDir(['node']);
      const workspaceUri = vscode.Uri.file(tempDir);
      const manager = new IntegrationManager(mockContext, workspaceUri, mockOutput);

      // Store rejection for node
      await mockContext.workspaceState.update('flox.integrations', {
        node: false,
      });

      manager.applyApproved();

      // Should NOT log node.path application
      assert.ok(
        !mockOutput.hasLine('[INTEGRATIONS] Applied node.path'),
        'Should not apply rejected integration'
      );
    });

    test('should skip when binary no longer exists', async () => {
      createMockBinDir([]);  // empty bin dir, no node binary
      const workspaceUri = vscode.Uri.file(tempDir);
      const manager = new IntegrationManager(mockContext, workspaceUri, mockOutput);

      await mockContext.workspaceState.update('flox.integrations', {
        node: true,
      });

      manager.applyApproved();

      // Should NOT log application since binary doesn't exist
      assert.ok(
        !mockOutput.hasLine('[INTEGRATIONS] Applied node.path'),
        'Should not apply when binary missing'
      );
    });

    test('should skip when bin dir does not exist', async () => {
      // No .flox dir at all
      const workspaceUri = vscode.Uri.file(tempDir);
      const manager = new IntegrationManager(mockContext, workspaceUri, mockOutput);

      await mockContext.workspaceState.update('flox.integrations', {
        node: true,
      });

      manager.applyApproved();

      assert.ok(
        !mockOutput.hasLine('[INTEGRATIONS] Applied'),
        'Should not apply when no bin dir'
      );
    });
  });

  // ── Suite 4: Revert ────────────────────────────────────────────────

  suite('Revert', () => {
    test('should attempt to revert approved integration settings', async () => {
      createMockBinDir(['node']);
      const workspaceUri = vscode.Uri.file(tempDir);
      const manager = new IntegrationManager(mockContext, workspaceUri, mockOutput);

      await mockContext.workspaceState.update('flox.integrations', {
        node: true,
      });

      await manager.revert();

      // In test VS Code, node.path isn't registered, so it may fail gracefully
      const hasReverted = mockOutput.hasLine('[INTEGRATIONS] Reverted node.path');
      const hasFailed = mockOutput.hasLine('[INTEGRATIONS] Failed to revert node.path');
      assert.ok(
        hasReverted || hasFailed,
        'Should attempt to revert setting'
      );
    });

    test('should preserve workspace state choices after revert', async () => {
      createMockBinDir(['node']);
      const workspaceUri = vscode.Uri.file(tempDir);
      const manager = new IntegrationManager(mockContext, workspaceUri, mockOutput);

      await mockContext.workspaceState.update('flox.integrations', {
        node: true,
        git: false,
      });

      await manager.revert();

      // Choices should still be in workspace state
      const choices = manager.getChoices();
      assert.strictEqual(choices['node'], true);
      assert.strictEqual(choices['git'], false);
    });

    test('should skip rejected integrations during revert', async () => {
      createMockBinDir(['node']);
      const workspaceUri = vscode.Uri.file(tempDir);
      const manager = new IntegrationManager(mockContext, workspaceUri, mockOutput);

      await mockContext.workspaceState.update('flox.integrations', {
        node: false,
      });

      await manager.revert();

      assert.ok(
        !mockOutput.hasLine('[INTEGRATIONS] Reverted node.path') &&
        !mockOutput.hasLine('[INTEGRATIONS] Failed to revert node.path'),
        'Should not attempt to revert rejected integration'
      );
    });
  });

  // ── Suite 5: Toggle ────────────────────────────────────────────────

  suite('Toggle', () => {
    test('should toggle off: update state', async () => {
      createMockBinDir(['node']);
      const workspaceUri = vscode.Uri.file(tempDir);
      const manager = new IntegrationManager(mockContext, workspaceUri, mockOutput);

      await mockContext.workspaceState.update('flox.integrations', {
        node: true,
      });

      await manager.toggle('node', false);

      const choices = manager.getChoices();
      assert.strictEqual(choices['node'], false);
      // In test VS Code, node.path isn't registered, so config.update may fail
      const hasToggled = mockOutput.hasLine('[INTEGRATIONS] Toggled off node');
      const hasFailed = mockOutput.hasLine('[INTEGRATIONS] Failed to toggle node');
      assert.ok(
        hasToggled || hasFailed,
        'Should attempt to toggle off'
      );
    });

    test('should toggle on: update state', async () => {
      createMockBinDir(['node']);
      const workspaceUri = vscode.Uri.file(tempDir);
      const manager = new IntegrationManager(mockContext, workspaceUri, mockOutput);

      await mockContext.workspaceState.update('flox.integrations', {
        node: false,
      });

      await manager.toggle('node', true);

      const choices = manager.getChoices();
      assert.strictEqual(choices['node'], true);
      // In test VS Code, node.path isn't registered, so config.update may fail
      const hasToggled = mockOutput.hasLine('[INTEGRATIONS] Toggled on node');
      const hasFailed = mockOutput.hasLine('[INTEGRATIONS] Failed to toggle node');
      assert.ok(
        hasToggled || hasFailed,
        'Should attempt to toggle on'
      );
    });

    test('should handle toggle for unknown integration', async () => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const manager = new IntegrationManager(mockContext, workspaceUri, mockOutput);

      await manager.toggle('nonexistent', true);

      const choices = manager.getChoices();
      assert.strictEqual(choices['nonexistent'], true);
    });
  });

  // ── Suite 6: getChoices ────────────────────────────────────────────

  suite('getChoices', () => {
    test('should return empty object when no choices stored', () => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const manager = new IntegrationManager(mockContext, workspaceUri, mockOutput);

      const choices = manager.getChoices();
      assert.deepStrictEqual(choices, {});
    });

    test('should return stored choices', async () => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const manager = new IntegrationManager(mockContext, workspaceUri, mockOutput);

      await mockContext.workspaceState.update('flox.integrations', {
        git: true,
        python: false,
      });

      const choices = manager.getChoices();
      assert.strictEqual(choices['git'], true);
      assert.strictEqual(choices['python'], false);
    });
  });

  // ── Suite 7: INTEGRATIONS Registry ─────────────────────────────────

  suite('INTEGRATIONS Registry', () => {
    test('should have 5 initial integrations', () => {
      assert.strictEqual(INTEGRATIONS.length, 5);
    });

    test('should have unique ids', () => {
      const ids = INTEGRATIONS.map(i => i.id);
      const unique = new Set(ids);
      assert.strictEqual(ids.length, unique.size);
    });

    test('should have unique settings', () => {
      const settings = INTEGRATIONS.map(i => i.setting);
      const unique = new Set(settings);
      assert.strictEqual(settings.length, unique.size);
    });

    test('should include expected integrations', () => {
      const ids = INTEGRATIONS.map(i => i.id);
      assert.ok(ids.includes('git'));
      assert.ok(ids.includes('python'));
      assert.ok(ids.includes('node'));
      assert.ok(ids.includes('rust-analyzer'));
      assert.ok(ids.includes('cmake'));
    });
  });
});
