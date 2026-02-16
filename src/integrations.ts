import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface Integration {
  id: string;
  binary: string;
  setting: string;
  label: string;
  extensionId?: string;
}

export const INTEGRATIONS: Integration[] = [
  {
    id: 'git',
    binary: 'git',
    setting: 'git.path',
    label: 'Git (Source Control)',
    extensionId: 'vscode.git',
  },
  {
    id: 'python',
    binary: 'python3',
    setting: 'python.defaultInterpreterPath',
    label: 'Python (Interpreter)',
    extensionId: 'ms-python.python',
  },
  {
    id: 'node',
    binary: 'node',
    setting: 'node.path',
    label: 'Node.js (Runtime)',
  },
  {
    id: 'rust-analyzer',
    binary: 'rust-analyzer',
    setting: 'rust-analyzer.server.path',
    label: 'Rust Analyzer (Language Server)',
    extensionId: 'rust-lang.rust-analyzer',
  },
  {
    id: 'cmake',
    binary: 'cmake',
    setting: 'cmake.cmakePath',
    label: 'CMake (Build Tool)',
    extensionId: 'ms-vscode.cmake-tools',
  },
];

export class IntegrationManager {
  private context: vscode.ExtensionContext;
  private workspaceUri: vscode.Uri | undefined;
  private output: vscode.OutputChannel;

  constructor(
    context: vscode.ExtensionContext,
    workspaceUri: vscode.Uri | undefined,
    output: vscode.OutputChannel,
  ) {
    this.context = context;
    this.workspaceUri = workspaceUri;
    this.output = output;
  }

  /** Resolve the Flox environment bin directory. */
  resolveBinDir(): string | undefined {
    if (!this.workspaceUri) {
      return undefined;
    }

    const runDir = path.join(this.workspaceUri.fsPath, '.flox', 'run');
    if (!fs.existsSync(runDir)) {
      return undefined;
    }

    try {
      const entries = fs.readdirSync(runDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() || entry.isSymbolicLink()) {
          const binDir = path.join(runDir, entry.name, 'bin');
          if (fs.existsSync(binDir)) {
            return binDir;
          }
        }
      }
    } catch {
      return undefined;
    }

    return undefined;
  }

  /** Scan for available integrations based on binaries in the bin dir. */
  scan(): Integration[] {
    const binDir = this.resolveBinDir();
    if (!binDir) {
      this.output.appendLine('[INTEGRATIONS] No bin dir found');
      return [];
    }

    this.output.appendLine(`[INTEGRATIONS] Scanning bin dir: ${binDir}`);

    const available: Integration[] = [];
    for (const integration of INTEGRATIONS) {
      // Check if the binary exists
      const binaryPath = path.join(binDir, integration.binary);
      if (!fs.existsSync(binaryPath)) {
        continue;
      }

      // Check if the required extension is installed
      if (integration.extensionId) {
        const ext = vscode.extensions.getExtension(integration.extensionId);
        if (!ext) {
          this.output.appendLine(
            `[INTEGRATIONS] Skipping ${integration.id}: extension ${integration.extensionId} not installed`
          );
          continue;
        }
      }

      available.push(integration);
    }

    this.output.appendLine(
      `[INTEGRATIONS] Found ${available.length} available integrations: ${available.map(i => i.id).join(', ')}`
    );
    return available;
  }

  /** Apply settings for previously approved integrations. */
  applyApproved(): void {
    const choices = this.getChoices();
    const binDir = this.resolveBinDir();

    if (!binDir) {
      return;
    }

    for (const [id, enabled] of Object.entries(choices)) {
      if (!enabled) {
        continue;
      }

      const integration = INTEGRATIONS.find(i => i.id === id);
      if (!integration) {
        continue;
      }

      const binaryPath = path.join(binDir, integration.binary);
      if (!fs.existsSync(binaryPath)) {
        continue;
      }

      try {
        const config = vscode.workspace.getConfiguration();
        config.update(
          integration.setting,
          binaryPath,
          vscode.ConfigurationTarget.Workspace
        );
        this.output.appendLine(
          `[INTEGRATIONS] Applied ${integration.setting} = ${binaryPath}`
        );
      } catch {
        this.output.appendLine(
          `[INTEGRATIONS] Failed to apply ${integration.setting} (setting not registered)`
        );
      }
    }
  }

  /** Prompt user for new integrations not yet in workspace state. */
  async promptForNew(available: Integration[]): Promise<void> {
    const choices = this.getChoices();

    // Filter to integrations the user hasn't seen yet
    const newIntegrations = available.filter(i => !(i.id in choices));

    if (newIntegrations.length === 0) {
      return;
    }

    this.output.appendLine(
      `[INTEGRATIONS] Prompting for ${newIntegrations.length} new integrations`
    );

    const items: vscode.QuickPickItem[] = newIntegrations.map(i => ({
      label: i.label,
      description: i.setting,
      picked: false,
    }));

    const selected = await vscode.window.showQuickPick(items, {
      canPickMany: true,
      placeHolder: 'Flox provides these tools. Select which ones VS Code should use:',
      title: 'Flox: Configure VS Code Integrations',
    });

    if (selected === undefined) {
      // User dismissed — don't store anything, prompt again next time
      return;
    }

    const selectedLabels = new Set(selected.map(s => s.label));
    const binDir = this.resolveBinDir();

    for (const integration of newIntegrations) {
      const enabled = selectedLabels.has(integration.label);
      choices[integration.id] = enabled;

      if (enabled && binDir) {
        const binaryPath = path.join(binDir, integration.binary);
        try {
          const config = vscode.workspace.getConfiguration();
          await config.update(
            integration.setting,
            binaryPath,
            vscode.ConfigurationTarget.Workspace
          );
          this.output.appendLine(
            `[INTEGRATIONS] User approved ${integration.id}, set ${integration.setting} = ${binaryPath}`
          );
        } catch {
          this.output.appendLine(
            `[INTEGRATIONS] Failed to set ${integration.setting} (setting not registered)`
          );
        }
      } else {
        this.output.appendLine(
          `[INTEGRATIONS] User rejected ${integration.id}`
        );
      }
    }

    await this.context.workspaceState.update('flox.integrations', choices);
  }

  /** Revert all approved integration settings (on deactivation). */
  async revert(): Promise<void> {
    const choices = this.getChoices();
    const config = vscode.workspace.getConfiguration();

    for (const [id, enabled] of Object.entries(choices)) {
      if (!enabled) {
        continue;
      }

      const integration = INTEGRATIONS.find(i => i.id === id);
      if (!integration) {
        continue;
      }

      try {
        await config.update(
          integration.setting,
          undefined,
          vscode.ConfigurationTarget.Workspace
        );
        this.output.appendLine(
          `[INTEGRATIONS] Reverted ${integration.setting}`
        );
      } catch {
        this.output.appendLine(
          `[INTEGRATIONS] Failed to revert ${integration.setting} (setting not registered)`
        );
      }
    }
  }

  /** Toggle an integration on or off. */
  async toggle(id: string, enabled: boolean): Promise<void> {
    const choices = this.getChoices();
    choices[id] = enabled;
    await this.context.workspaceState.update('flox.integrations', choices);

    const integration = INTEGRATIONS.find(i => i.id === id);
    if (!integration) {
      return;
    }

    const config = vscode.workspace.getConfiguration();

    try {
      if (enabled) {
        const binDir = this.resolveBinDir();
        if (binDir) {
          const binaryPath = path.join(binDir, integration.binary);
          await config.update(
            integration.setting,
            binaryPath,
            vscode.ConfigurationTarget.Workspace
          );
          this.output.appendLine(
            `[INTEGRATIONS] Toggled on ${integration.id}: ${integration.setting} = ${binaryPath}`
          );
        }
      } else {
        await config.update(
          integration.setting,
          undefined,
          vscode.ConfigurationTarget.Workspace
        );
        this.output.appendLine(
          `[INTEGRATIONS] Toggled off ${integration.id}: removed ${integration.setting}`
        );
      }
    } catch {
      this.output.appendLine(
        `[INTEGRATIONS] Failed to toggle ${integration.id} (setting not registered)`
      );
    }
  }

  /** Get stored integration choices from workspace state. */
  getChoices(): Record<string, boolean> {
    return this.context.workspaceState.get<Record<string, boolean>>(
      'flox.integrations'
    ) || {};
  }
}
