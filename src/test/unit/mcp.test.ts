import * as assert from 'assert';
import * as vscode from 'vscode';
import { FloxMcpProvider, registerMcpProvider } from '../../mcp';
import { createMockExtensionContext } from '../mocks/vscode';

suite('MCP Unit Tests', () => {
  let mockContext: vscode.ExtensionContext;
  let workspaceUri: vscode.Uri;

  setup(() => {
    mockContext = createMockExtensionContext();
    workspaceUri = vscode.Uri.file('/test/workspace');
  });

  suite('FloxMcpProvider', () => {
    test('should construct with workspace URI', () => {
      const provider = new FloxMcpProvider(workspaceUri);
      assert.ok(provider);
    });

    test('should construct without workspace URI', () => {
      const provider = new FloxMcpProvider(undefined);
      assert.ok(provider);
    });

    test('should provide server definition with correct command', async () => {
      const provider = new FloxMcpProvider(workspaceUri);
      const token = new vscode.CancellationTokenSource().token;

      const definitions = await provider.provideMcpServerDefinitions(token);

      assert.strictEqual(definitions.length, 1);
      assert.strictEqual(definitions[0].label, 'Flox MCP');
      assert.strictEqual(definitions[0].command, 'flox-mcp');
      assert.ok(Array.isArray(definitions[0].args));
      assert.strictEqual(definitions[0].args.length, 0);
    });

    test('should use workspace URI as cwd', async () => {
      const provider = new FloxMcpProvider(workspaceUri);
      const token = new vscode.CancellationTokenSource().token;

      const definitions = await provider.provideMcpServerDefinitions(token);

      assert.strictEqual(definitions[0].cwd, workspaceUri);
    });

    test('should have undefined cwd when no workspace URI', async () => {
      const provider = new FloxMcpProvider(undefined);
      const token = new vscode.CancellationTokenSource().token;

      const definitions = await provider.provideMcpServerDefinitions(token);

      assert.strictEqual(definitions[0].cwd, undefined);
    });

    test('should emit change event on refresh', (done) => {
      const provider = new FloxMcpProvider(workspaceUri);

      provider.onDidChangeMcpServerDefinitions(() => {
        done();
      });

      provider.refresh();
    });

    test('should dispose event emitter on dispose', () => {
      const provider = new FloxMcpProvider(workspaceUri);

      // Should not throw
      provider.dispose();
      assert.ok(true);
    });
  });

  suite('registerMcpProvider', () => {
    test('should handle when MCP API is unavailable', () => {
      // Note: We can't properly mock vscode.lm since it's read-only
      // This test just verifies the function doesn't throw
      // Integration tests verify actual registration works
      const provider = registerMcpProvider(mockContext, workspaceUri);

      // Should either return provider (if API available) or undefined (if not)
      // Both are valid outcomes depending on VSCode version
      assert.ok(provider === undefined || provider instanceof FloxMcpProvider);
    });

    test('should not throw when called with valid parameters', () => {
      // Verify function handles both API available and unavailable cases gracefully
      assert.doesNotThrow(() => {
        registerMcpProvider(mockContext, workspaceUri);
      });
    });
  });
});
