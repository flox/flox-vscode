/**
 * MCP Installation Integration Tests
 *
 * Tests the installation of flox-mcp-server package.
 * These tests verify that the package can be installed and detected.
 *
 * Requirements:
 * - Flox CLI must be installed
 * - Tests run in test-fixtures/workspace directory
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { execFile } from 'child_process';

const execFileAsync = promisify(execFile);

suite('MCP Install Integration Tests', () => {
  let workspaceDir: string;

  async function isFloxInstalled(): Promise<boolean> {
    try {
      await execFileAsync('flox', ['--version'], { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  async function waitFor(
    condition: () => boolean | Promise<boolean>,
    timeoutMs: number = 10000,
    intervalMs: number = 100
  ): Promise<void> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const result = await condition();
      if (result) { return; }
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    throw new Error(`Timeout waiting for condition after ${timeoutMs}ms`);
  }

  setup(async function() {
    console.log('📁 Using workspace:', vscode.workspace.workspaceFolders?.[0]?.uri.fsPath);

    // Skip if SKIP_FLOX_TESTS is set
    if (process.env.SKIP_FLOX_TESTS) {
      console.log('⊘ Skipping MCP install tests - SKIP_FLOX_TESTS is set');
      this.skip();
      return;
    }

    // Skip if Flox not installed
    const floxInstalled = await isFloxInstalled();
    if (!floxInstalled) {
      console.log('⊘ Skipping MCP install tests - Flox CLI not found');
      this.skip();
      return;
    }

    // Get workspace from test runner
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      console.log('⊘ Skipping MCP install tests - No workspace folder');
      this.skip();
      return;
    }
    workspaceDir = workspaceFolders[0].uri.fsPath;
    console.log('🧹 Setup floxDir:', path.join(workspaceDir, '.flox'));

    // Clean up .flox directory
    const floxDir = path.join(workspaceDir, '.flox');
    if (fs.existsSync(floxDir)) {
      fs.rmSync(floxDir, { recursive: true, force: true });
    }
  });

  teardown(async function() {
    if (process.env.SKIP_FLOX_TESTS) { return; }

    console.log('🗑️  Teardown floxDir:', path.join(workspaceDir, '.flox'));
    // Clean up .flox directory
    const floxDir = path.join(workspaceDir, '.flox');
    if (fs.existsSync(floxDir)) {
      fs.rmSync(floxDir, { recursive: true, force: true });
      console.log('🗑️  Cleaned up .flox directory at:', floxDir);
    }
  });

  test('Install flox-mcp-server via CLI', async function() {
    this.timeout(120000); // 2 minutes

    console.log('\n🧪 Testing flox-mcp-server installation...\n');

    console.log('📦 Step 1: Initialize environment via CLI');
    await execFileAsync('flox', ['init', '--dir', workspaceDir], { timeout: 30000 });
    await waitFor(() => fs.existsSync(path.join(workspaceDir, '.flox')), 30000);

    console.log('📥 Step 2: Install flox-mcp-server package...');
    await execFileAsync('flox', [
      'install',
      'flox/flox-mcp-server',
      '--dir',
      workspaceDir
    ], { timeout: 90000 });

    // Wait for manifest to update
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('✅ Step 3: Verify package in manifest');
    // Verify package installed in manifest
    const manifestPath = path.join(workspaceDir, '.flox', 'env', 'manifest.toml');
    assert.ok(fs.existsSync(manifestPath), 'Manifest should exist');

    const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
    assert.ok(
      manifestContent.includes('flox-mcp-server') ||
      manifestContent.includes('flox/flox-mcp-server'),
      'MCP server should be in manifest'
    );

    console.log('✅ MCP server installation test PASSED\n');
  });

  test('Verify MCP package appears in lock file after install', async function() {
    this.timeout(120000); // 2 minutes

    console.log('\n🧪 Testing MCP package in lock file...\n');

    console.log('📦 Step 1: Initialize environment via CLI');
    await execFileAsync('flox', ['init', '--dir', workspaceDir], { timeout: 30000 });
    await waitFor(() => fs.existsSync(path.join(workspaceDir, '.flox')), 30000);

    console.log('📥 Step 2: Install flox-mcp-server package');
    await execFileAsync('flox', [
      'install',
      'flox/flox-mcp-server',
      '--dir',
      workspaceDir
    ], { timeout: 90000 });

    // Wait for lock file to update
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('✅ Step 3: Verify configure command exists');
    // Verify configure command exists (registered during extension activation)
    const commands = await vscode.commands.getCommands(true);
    assert.ok(
      commands.includes('flox.configureMcp'),
      'Configure MCP command should exist'
    );

    console.log('✅ Step 4: Verify lock file contains package');
    // Verify lock file exists and contains the package
    const lockPath = path.join(workspaceDir, '.flox', 'env', 'manifest.lock');
    if (fs.existsSync(lockPath)) {
      const lockContent = fs.readFileSync(lockPath, 'utf-8');
      // Lock file is JSON, should contain package reference
      assert.ok(
        lockContent.includes('flox-mcp-server') ||
        lockContent.includes('flox/flox-mcp-server'),
        'MCP server should be in lock file'
      );
    }

    console.log('✅ MCP package verification test PASSED\n');
  });
});
