import * as vscode from 'vscode';

/**
 * Package upgrade hints for manifest.toml.
 *
 * Runs `flox upgrade --dry-run`, which resolves the environment again without changing it and
 * reports what an upgrade would change. That respects version constraints and package groups,
 * so a hint only appears when `flox upgrade` would actually move the package.
 * The result is shown as CodeLenses in manifest.toml, above each package in [install].
 */

export type PackageUpgrade = {
  installId: string,
  /** Locked version today */
  from: string,
  /** Version after upgrading. Equal to `from` for a rebuild. */
  to: string,
  /** Same version, but a newer build of it (e.g. a newer nixpkgs revision) */
  rebuild: boolean,
};

export type Upgrades = Map<string, PackageUpgrade>;

// Lines of `flox upgrade --dry-run` look like:
//   - curl: 8.9.0 -> 8.10.1
//   - hello: 2.12.1 (rebuild)
const VERSION_CHANGE_LINE = /^- (.+): (\S+) -> (\S+)$/;
const REBUILD_LINE = /^- (.+): (\S+) \(rebuild\)$/;

/** Parse the output of `flox upgrade --dry-run` into the upgrades for this system. */
export function parseUpgradeDryRun(output: string): Upgrades {
  const upgrades: Upgrades = new Map();
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    let match = VERSION_CHANGE_LINE.exec(line);
    if (match) {
      upgrades.set(match[1], { installId: match[1], from: match[2], to: match[3], rebuild: false });
      continue;
    }
    match = REBUILD_LINE.exec(line);
    if (match) {
      upgrades.set(match[1], { installId: match[1], from: match[2], to: match[2], rebuild: true });
    }
  }
  return upgrades;
}

export type InstallEntryLines = {
  /** Line of the `[install]` table header, if present */
  header?: number,
  /** First line that mentions each install ID */
  entries: Map<string, number>,
};

const TABLE_HEADER = /^\s*\[\s*([^\]]+?)\s*\]\s*(#.*)?$/;
// `id.pkg-path = ...`, `id = { ... }`, `"id".version = ...`
const INSTALL_KEY = /^\s*(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9_-]+))\s*(?:\.|=)/;

/** Find where each package of the [install] table is declared in a manifest.toml. */
export function findInstallEntryLines(text: string): InstallEntryLines {
  const result: InstallEntryLines = { entries: new Map() };
  let inInstall = false;
  text.split(/\r?\n/).forEach((line, index) => {
    const header = TABLE_HEADER.exec(line);
    if (header) {
      const table = header[1];
      inInstall = table === 'install';
      if (inInstall && result.header === undefined) {
        result.header = index;
      }
      // A package can also be its own table: [install.hello] or [install."hello"]
      const subTable = /^install\.(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9_-]+))$/.exec(table);
      if (subTable) {
        const installId = subTable[1] ?? subTable[2] ?? subTable[3];
        if (!result.entries.has(installId)) {
          result.entries.set(installId, index);
        }
      }
      return;
    }
    if (!inInstall) {
      return;
    }
    const key = INSTALL_KEY.exec(line);
    if (key) {
      const installId = key[1] ?? key[2] ?? key[3];
      if (!result.entries.has(installId)) {
        result.entries.set(installId, index);
      }
    }
  });
  return result;
}

/** Text shown above a package that can be upgraded */
export function upgradeLensTitle(upgrade: PackageUpgrade): string {
  return upgrade.rebuild
    ? `Rebuild available: ${upgrade.from} (newer build)`
    : `Upgrade available: ${upgrade.from} -> ${upgrade.to}`;
}

export function isFloxManifest(uri: vscode.Uri): boolean {
  return /[\\/]\.flox[\\/]env[\\/]manifest\.toml$/.test(uri.fsPath);
}

/**
 * CodeLenses for manifest.toml: one above each package with an available upgrade,
 * and one on the [install] header to upgrade all of them.
 */
export class UpgradeCodeLensProvider implements vscode.CodeLensProvider {
  private upgrades: Upgrades = new Map();
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.changed.event;

  setUpgrades(upgrades: Upgrades) {
    this.upgrades = upgrades;
    this.changed.fire();
  }

  getUpgrades(): Upgrades {
    return this.upgrades;
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (!isFloxManifest(document.uri) || this.upgrades.size === 0) {
      return [];
    }
    const lines = findInstallEntryLines(document.getText());
    const lenses: vscode.CodeLens[] = [];

    if (lines.header !== undefined) {
      const count = this.upgrades.size;
      lenses.push(new vscode.CodeLens(document.lineAt(lines.header).range, {
        title: `Upgrade all (${count} package${count === 1 ? '' : 's'})`,
        command: 'flox.upgradeAll',
        tooltip: 'Run flox upgrade',
      }));
    }

    for (const [installId, line] of lines.entries) {
      const upgrade = this.upgrades.get(installId);
      if (!upgrade) {
        continue;
      }
      lenses.push(new vscode.CodeLens(document.lineAt(line).range, {
        title: upgradeLensTitle(upgrade),
        command: 'flox.upgradePackage',
        arguments: [installId],
        tooltip: `Run flox upgrade ${installId}`,
      }));
    }
    return lenses;
  }
}

export type FloxRunner = (argv: string[]) => Promise<{ stdout: string, stderr: string }>;

export type UpgradeHintsDeps = {
  /** Run the flox CLI with these arguments */
  runFlox: FloxRunner,
  /** Directory of the workspace's Flox environment, if any */
  workspaceDir: () => string | undefined,
  /** Register a command (Env.registerCommand, which reports errors) */
  registerCommand: (name: string, command: (...args: any[]) => any) => void,
  log: (message: string) => void,
  /** Whether the `flox.showPackageUpgrades` setting is on */
  enabled: () => boolean,
};

/**
 * Show package upgrades in manifest.toml and add the commands to check for and apply them.
 * Upgrades are checked when the extension starts, whenever manifest.lock changes, and on demand.
 */
export function registerUpgradeHints(context: vscode.ExtensionContext, deps: UpgradeHintsDeps) {
  const provider = new UpgradeCodeLensProvider();
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider({ pattern: '**/.flox/env/manifest.toml' }, provider),
  );

  let running: Promise<Upgrades> | undefined;
  const refresh = async (): Promise<Upgrades> => {
    const dir = deps.workspaceDir();
    if (!deps.enabled() || !dir) {
      provider.setUpgrades(new Map());
      return provider.getUpgrades();
    }
    // Coalesce bursts of manifest.lock events into one dry run
    if (!running) {
      running = (async () => {
        try {
          const { stdout, stderr } = await deps.runFlox(['upgrade', '--dry-run', '--dir', dir]);
          // flox prints the dry-run summary on stderr
          const upgrades = parseUpgradeDryRun(`${stderr}\n${stdout}`);
          deps.log(`[UPGRADES] ${upgrades.size} package upgrade(s) available`);
          provider.setUpgrades(upgrades);
        } catch (error) {
          deps.log(`[UPGRADES] Could not check for package upgrades: ${error}`);
          provider.setUpgrades(new Map());
        } finally {
          running = undefined;
        }
        return provider.getUpgrades();
      })();
    }
    return running;
  };

  const lockWatcher = vscode.workspace.createFileSystemWatcher('**/.flox/env/manifest.lock');
  lockWatcher.onDidChange(() => refresh());
  lockWatcher.onDidCreate(() => refresh());
  lockWatcher.onDidDelete(() => provider.setUpgrades(new Map()));
  context.subscriptions.push(
    lockWatcher,
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('flox.showPackageUpgrades')) {
        refresh();
      }
    }),
  );

  const upgrade = async (installIds: string[]) => {
    const dir = deps.workspaceDir();
    if (!dir) {
      return;
    }
    const what = installIds.length ? installIds.join(', ') : 'all packages';
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Upgrading ${what}...`,
    }, async () => {
      await deps.runFlox(['upgrade', '--dir', dir, ...installIds]);
    });
    vscode.window.showInformationMessage(`Flox: upgraded ${what}.`);
    await refresh();
  };

  deps.registerCommand('flox.checkPackageUpgrades', async () => {
    const upgrades = await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Checking for package upgrades...',
    }, () => refresh());
    vscode.window.showInformationMessage(upgrades.size
      ? `Flox: ${upgrades.size} package upgrade(s) available. See the hints in manifest.toml.`
      : 'Flox: all packages are up to date.');
  });
  deps.registerCommand('flox.upgradePackage', (installId: string) => upgrade([installId]));
  deps.registerCommand('flox.upgradeAll', () => upgrade([]));

  refresh();
  return { provider, refresh };
}
