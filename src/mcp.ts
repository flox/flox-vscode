import * as vscode from 'vscode';

/**
 * MCP Server Definition Provider for Flox Agentic.
 *
 * This provider tells VSCode how to start the flox-mcp server.
 * When Copilot needs to use the server, VSCode calls provideMcpServerDefinitions().
 */
export class FloxMcpProvider implements vscode.McpServerDefinitionProvider<any> {
  private _onDidChangeMcpServerDefinitions = new vscode.EventEmitter<void>();
  readonly onDidChangeMcpServerDefinitions = this._onDidChangeMcpServerDefinitions.event;

  constructor(private workspaceUri: vscode.Uri | undefined) {}

  /**
   * Provide MCP server definitions.
   * Returns configuration for how to start flox-mcp server.
   */
  async provideMcpServerDefinitions(
    _token: vscode.CancellationToken
  ): Promise<any[]> {
    // Return stdio-based server definition
    // flox-mcp communicates via stdin/stdout
    // Using any type since MCP API types may not be fully available in current vscode types
    return [{
      label: 'Flox Agentic',
      command: 'flox-mcp',
      args: [],
      cwd: this.workspaceUri,
    }];
  }

  /**
   * Trigger refresh when workspace or environment changes.
   */
  refresh(): void {
    this._onDidChangeMcpServerDefinitions.fire();
  }

  dispose(): void {
    this._onDidChangeMcpServerDefinitions.dispose();
  }
}

/**
 * Register MCP provider with VSCode.
 * Feature-detects API to maintain backwards compatibility.
 *
 * @param context Extension context for disposal
 * @param workspaceUri Workspace root for cwd
 * @returns Provider instance or undefined if API unavailable
 */
export function registerMcpProvider(
  context: vscode.ExtensionContext,
  workspaceUri: vscode.Uri | undefined
): FloxMcpProvider | undefined {
  // Feature-detect MCP API (only available VSCode 1.102+)
  if (typeof (vscode as any).lm?.registerMcpServerDefinitionProvider !== 'function') {
    console.log('MCP API not available in this VSCode version');
    return undefined;
  }

  const provider = new FloxMcpProvider(workspaceUri);

  const disposable = (vscode as any).lm.registerMcpServerDefinitionProvider(
    'floxMcp', // Must match package.json contribution id
    provider
  );

  context.subscriptions.push(disposable);
  context.subscriptions.push(provider);

  console.log('Flox MCP provider registered');
  return provider;
}
